package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type config struct {
	Addr              string
	PocketBaseURL     string
	PocketBasePublic  string
	Collection        string
	Token             string
	PBToken           string
	PBEmail           string
	PBPassword        string
	Timeout           time.Duration
	MaxUploadBytes    int64
	MaxArchiveBytes   int64
	MaxMediaFiles     int
	DefaultCategory   string
	DefaultLocation   string
	ValidCategories   map[string]bool
	MultipartMemory   int64
}

type server struct {
	cfg        config
	client     *http.Client
	tokenMu    sync.Mutex
	tokenCache string
}

type appError struct {
	Code       string         `json:"error"`
	StatusCode int            `json:"-"`
	Extra      map[string]any `json:"-"`
}

func (e *appError) Error() string {
	return e.Code
}

type parsedMemo struct {
	RecordID string
	Category string
	Location string
	Text     string
	Status   string
	Delete   bool
	Hidden   bool
	Kind     string
}

type fileInfo struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	Kind        string `json:"kind"`
}

type uploadPart struct {
	Field       string
	Filename    string
	ContentType string
	Data        []byte
	Size        int64
	Kind        string
}

type archivePayload struct {
	MarkdownParent string
	RawMarkdown    string
	MemoText       string
	Media          []uploadPart
	MediaPaths     []string
}

var (
	directiveRe   = regexp.MustCompile(`^@([^:：\s]+)(?:[:：\s]\s*(.*))?$`)
	imageRefRe    = regexp.MustCompile(`!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)`)
	imageLineRe   = regexp.MustCompile(`(?im)^[ \t]*!\[[^\]]*\]\((?:\.?/)?attachments/[^)\s]+(?:\s+"[^"]*")?\)[ \t]*\n?`)
	imageInlineRe = regexp.MustCompile(`(?i)!\[[^\]]*\]\((?:\.?/)?attachments/[^)\s]+(?:\s+"[^"]*")?\)`)
	imageExts     = map[string]bool{".avif": true, ".gif": true, ".heic": true, ".heif": true, ".jpeg": true, ".jpg": true, ".png": true, ".webp": true}
	videoExts     = map[string]bool{".m4v": true, ".mov": true, ".mp4": true, ".webm": true}
)

func main() {
	cfg := loadConfig()
	s := &server{
		cfg: cfg,
		client: &http.Client{
			Timeout: cfg.Timeout,
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", method(http.MethodGet, s.health))
	mux.HandleFunc("/api/memos/sync", method(http.MethodPost, s.syncMemo))
	mux.HandleFunc("/api/memos/import", method(http.MethodPost, s.importMemo))

	log.Printf("event=start addr=%s pocketbase=%s collection=%s", cfg.Addr, cfg.PocketBaseURL, cfg.Collection)
	if err := http.ListenAndServe(cfg.Addr, mux); err != nil {
		log.Fatal(err)
	}
}

func method(expected string, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != expected {
			w.Header().Set("Allow", expected)
			fail(w, http.StatusMethodNotAllowed, "", "method_not_allowed", nil)
			return
		}
		handler(w, r)
	}
}

func loadConfig() config {
	pbURL := strings.TrimRight(env("POCKETBASE_URL", "http://127.0.0.1:8090"), "/")
	categories := map[string]bool{}
	for _, item := range strings.Split(env("MEMOS_CATEGORIES", "风景,碎语,吐槽,分享"), ",") {
		item = strings.TrimSpace(item)
		if item != "" {
			categories[item] = true
		}
	}
	defaultCategory := "碎语"
	categories[defaultCategory] = true

	return config{
		Addr:            env("MEMOS_GATEWAY_ADDR", "127.0.0.1:8787"),
		PocketBaseURL:   pbURL,
		PocketBasePublic: strings.TrimRight(env("POCKETBASE_PUBLIC_URL", pbURL), "/"),
		Collection:      env("POCKETBASE_COLLECTION", "memos"),
		Token:           os.Getenv("MEMOS_SYNC_TOKEN"),
		PBToken:         os.Getenv("POCKETBASE_TOKEN"),
		PBEmail:         os.Getenv("POCKETBASE_EMAIL"),
		PBPassword:      os.Getenv("POCKETBASE_PASSWORD"),
		Timeout:         time.Duration(envInt("POCKETBASE_TIMEOUT_SECONDS", 300)) * time.Second,
		MaxUploadBytes:  int64(envInt("MEMOS_MAX_UPLOAD_MB", 300)) * 1024 * 1024,
		MaxArchiveBytes: int64(envInt("MEMOS_MAX_ARCHIVE_MB", 300)) * 1024 * 1024,
		MaxMediaFiles:   envInt("MEMOS_MAX_MEDIA_FILES", 9),
		DefaultCategory: defaultCategory,
		DefaultLocation: "未标注",
		ValidCategories: categories,
		MultipartMemory: int64(envInt("MEMOS_MULTIPART_MEMORY_MB", 24)) * 1024 * 1024,
	}
}

func env(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func requestID() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b[:])
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func writeJSON(w http.ResponseWriter, status int, payload map[string]any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func fail(w http.ResponseWriter, status int, requestID, code string, extra map[string]any) {
	payload := map[string]any{"ok": false, "error": code}
	if requestID != "" {
		payload["request_id"] = requestID
	}
	for key, value := range extra {
		payload[key] = value
	}
	writeJSON(w, status, payload)
}

func (s *server) requireToken(r *http.Request, formToken, requestID string) *appError {
	if s.cfg.Token == "" {
		return &appError{Code: "server_token_not_configured", StatusCode: 500}
	}
	bearer := ""
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		bearer = strings.TrimSpace(auth[7:])
	}
	if formToken != s.cfg.Token && bearer != s.cfg.Token {
		return &appError{Code: "unauthorized", StatusCode: 401}
	}
	return nil
}

func parseFlexibleForm(r *http.Request, memoryLimit int64) error {
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.HasPrefix(contentType, "multipart/form-data") {
		return r.ParseMultipartForm(memoryLimit)
	}
	if err := r.ParseForm(); err != nil {
		return err
	}
	if r.MultipartForm == nil {
		r.MultipartForm = &multipart.Form{
			Value: map[string][]string{},
			File:  map[string][]*multipart.FileHeader{},
		}
	}
	return nil
}

func formFiles(r *http.Request, field string) []*multipart.FileHeader {
	if r.MultipartForm == nil || r.MultipartForm.File == nil {
		return nil
	}
	return r.MultipartForm.File[field]
}

func multipartFiles(form *multipart.Form, field string) []*multipart.FileHeader {
	if form == nil || form.File == nil {
		return nil
	}
	return form.File[field]
}

func parseContent(raw string, cfg config) parsedMemo {
	text := strings.ReplaceAll(strings.ReplaceAll(raw, "\r\n", "\n"), "\r", "\n")
	lines := strings.Split(text, "\n")
	parsed := parsedMemo{
		Category: cfg.DefaultCategory,
		Location: cfg.DefaultLocation,
		Status:   "published",
		Kind:     "memo",
	}
	body := make([]string, 0, len(lines))

	for _, line := range lines {
		stripped := strings.TrimSpace(line)
		match := directiveRe.FindStringSubmatch(stripped)
		if match == nil {
			body = append(body, line)
			continue
		}
		key := strings.ToLower(strings.TrimSpace(match[1]))
		value := ""
		if len(match) > 2 {
			value = strings.TrimSpace(match[2])
		}
		switch key {
		case "id":
			parsed.RecordID = value
		case "cate", "category", "cat":
			if cfg.ValidCategories[value] {
				parsed.Category = value
			}
		case "location", "loc":
			if value != "" {
				parsed.Location = value
			}
		case "hide", "hidden":
			parsed.Hidden = true
			parsed.Status = "hidden"
		case "del", "delete":
			parsed.Delete = true
			parsed.Status = "deleted"
		case "note":
			parsed.Kind = "note"
		default:
			body = append(body, line)
		}
	}
	parsed.Text = strings.TrimSpace(strings.Join(body, "\n"))
	return parsed
}

func (s *server) getPocketBaseToken(ctx context.Context) (string, error) {
	if s.cfg.PBToken != "" {
		return s.cfg.PBToken, nil
	}
	s.tokenMu.Lock()
	defer s.tokenMu.Unlock()
	if s.tokenCache != "" {
		return s.tokenCache, nil
	}
	if s.cfg.PBEmail == "" || s.cfg.PBPassword == "" {
		return "", &appError{Code: "pocketbase_auth_not_configured", StatusCode: 500}
	}
	payload := map[string]string{"identity": s.cfg.PBEmail, "password": s.cfg.PBPassword}
	body, _ := json.Marshal(payload)
	paths := []string{"/api/collections/_superusers/auth-with-password", "/api/admins/auth-with-password"}
	var last string
	for _, apiPath := range paths {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.PocketBaseURL+apiPath, bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := s.client.Do(req)
		if err != nil {
			return "", err
		}
		data, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode < 400 {
			var decoded map[string]any
			if json.Unmarshal(data, &decoded) == nil {
				if token, ok := decoded["token"].(string); ok && token != "" {
					s.tokenCache = token
					return token, nil
				}
			}
		}
		last = string(data)
	}
	return "", &appError{Code: "pocketbase_auth_failed", StatusCode: 502, Extra: map[string]any{"detail": last}}
}

func (s *server) clearToken() {
	s.tokenMu.Lock()
	s.tokenCache = ""
	s.tokenMu.Unlock()
}

func (s *server) getRecord(ctx context.Context, token, id string) (map[string]any, bool, error) {
	record, status, body, err := s.pbJSON(ctx, token, http.MethodGet, fmt.Sprintf("/api/collections/%s/records/%s", s.cfg.Collection, id), nil)
	if status == 401 || status == 403 {
		s.clearToken()
		nextToken, err := s.getPocketBaseToken(ctx)
		if err != nil {
			return nil, false, err
		}
		record, status, body, err = s.pbJSON(ctx, nextToken, http.MethodGet, fmt.Sprintf("/api/collections/%s/records/%s", s.cfg.Collection, id), nil)
	}
	if err != nil {
		return nil, false, err
	}
	if status == 404 {
		return nil, false, nil
	}
	if status >= 400 {
		return nil, false, &appError{Code: "pocketbase_get_failed", StatusCode: 502, Extra: map[string]any{"detail": string(body), "pocketbase_status": status}}
	}
	return record, true, nil
}

func (s *server) pbJSON(ctx context.Context, token, method, apiPath string, data map[string]string) (map[string]any, int, []byte, error) {
	var body io.Reader
	if data != nil {
		values := url.Values{}
		for key, value := range data {
			values.Set(key, value)
		}
		body = strings.NewReader(values.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, s.cfg.PocketBaseURL+apiPath, body)
	if err != nil {
		return nil, 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if data != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var decoded map[string]any
	_ = json.Unmarshal(raw, &decoded)
	return decoded, resp.StatusCode, raw, nil
}

func (s *server) syncMemo(w http.ResponseWriter, r *http.Request) {
	reqID := requestID()
	if err := parseFlexibleForm(r, s.cfg.MultipartMemory); err != nil {
		fail(w, http.StatusBadRequest, reqID, "invalid_form", nil)
		return
	}
	if appErr := s.requireToken(r, r.FormValue("token"), reqID); appErr != nil {
		fail(w, appErr.StatusCode, reqID, appErr.Code, appErr.Extra)
		return
	}

	mediaMode := r.FormValue("media_mode")
	if mediaMode == "" {
		mediaMode = "replace"
	}
	if mediaMode != "replace" && mediaMode != "append" {
		fail(w, http.StatusBadRequest, reqID, "invalid_media_mode", nil)
		return
	}
	parsed := parseContent(r.FormValue("content"), s.cfg)
	hasUpload := len(formFiles(r, "media")) > 0 || len(formFiles(r, "poster")) > 0

	if parsed.Delete && parsed.RecordID == "" {
		fail(w, http.StatusBadRequest, reqID, "missing_id_for_delete", nil)
		return
	}
	if mediaMode == "append" && parsed.RecordID == "" {
		fail(w, http.StatusBadRequest, reqID, "missing_id_for_append", nil)
		return
	}
	if !parsed.Delete && parsed.Text == "" && !hasUpload {
		fail(w, http.StatusBadRequest, reqID, "empty_text", nil)
		return
	}
	if !parsed.Delete && parsed.Text == "" && hasUpload && parsed.RecordID == "" {
		fail(w, http.StatusBadRequest, reqID, "missing_id_for_media_only", nil)
		return
	}

	ctx := r.Context()
	token, err := s.getPocketBaseToken(ctx)
	if err != nil {
		handleErr(w, reqID, err)
		return
	}
	var existing map[string]any
	if parsed.RecordID != "" {
		record, found, err := s.getRecord(ctx, token, parsed.RecordID)
		if err != nil {
			handleErr(w, reqID, err)
			return
		}
		if !found {
			fail(w, http.StatusNotFound, reqID, "not_found", map[string]any{"id": parsed.RecordID})
			return
		}
		existing = record
	}
	if len(formFiles(r, "poster")) > 0 && len(formFiles(r, "media")) == 0 && !hasExistingMedia(existing) {
		fail(w, http.StatusBadRequest, reqID, "poster_without_media", nil)
		return
	}
	if parsed.Delete {
		_, status, body, err := s.pbWrite(ctx, token, http.MethodPatch, fmt.Sprintf("/api/collections/%s/records/%s", s.cfg.Collection, parsed.RecordID), map[string]string{"status": "deleted"}, nil, nil)
		if err != nil {
			handleErr(w, reqID, err)
			return
		}
		if status >= 400 {
			fail(w, http.StatusBadGateway, reqID, "pocketbase_delete_failed", map[string]any{"detail": string(body), "pocketbase_status": status})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "request_id": reqID, "action": "deleted", "id": parsed.RecordID, "status": "deleted", "content": map[string]any{"kind": "memo", "markdown": false}})
		return
	}

	record, result, err := s.submitSync(ctx, token, parsed, existing, r.MultipartForm, mediaMode)
	if err != nil {
		handleErr(w, reqID, err)
		return
	}
	action := "created"
	if existing != nil {
		action = "updated"
	}
	if parsed.Hidden && existing == nil {
		action = "created"
	} else if parsed.Hidden {
		action = "hidden"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "request_id": reqID, "action": action, "id": stringField(record, "id"),
		"category": stringField(record, "category"), "location": stringField(record, "location"), "status": stringField(record, "status"),
		"content": map[string]any{"kind": stringFieldDefault(record, "kind", "memo"), "markdown": false},
		"media_mode": mediaMode,
		"media": map[string]any{"received": result.MediaReceived, "saved": len(fileNames(record["media"])), "files": safeFileNames(record["media"]), "received_files": safeFileInfos(result.MediaFiles)},
		"poster": map[string]any{"received": result.PosterReceived, "saved": fileName(record["poster"]) != "", "file": fileName(record["poster"]), "received_file": result.PosterFile},
	})
}

type syncResult struct {
	MediaReceived  int
	PosterReceived bool
	MediaFiles     []fileInfo
	PosterFile     *fileInfo
}

func (s *server) submitSync(ctx context.Context, token string, parsed parsedMemo, existing map[string]any, form *multipart.Form, mediaMode string) (map[string]any, syncResult, error) {
	mediaField := "media"
	if mediaMode == "append" {
		mediaField = "media+"
	}
	mediaParts, mediaInfo, err := s.readFormFiles(multipartFiles(form, "media"), mediaField, []string{"image/", "video/"})
	if err != nil {
		return nil, syncResult{}, err
	}
	posterParts, posterInfo, err := s.readFormFiles(multipartFiles(form, "poster"), "poster", []string{"image/"})
	if err != nil {
		return nil, syncResult{}, err
	}
	mediaOnlyUpdate := existing != nil && parsed.Text == "" && (len(mediaParts) > 0 || len(posterParts) > 0)
	existingVideos := 0
	if mediaMode == "append" {
		existingVideos = countExistingVideos(existing)
	}
	if existingVideos+countInfoKind(mediaInfo, "video") > 1 {
		return nil, syncResult{}, &appError{Code: "multiple_videos_not_supported", StatusCode: 400, Extra: map[string]any{"existing_videos": existingVideos, "received_videos": countInfoKind(mediaInfo, "video")}}
	}
	current, next := mediaCountAfterWrite(existing, len(mediaParts), mediaMode)
	if next > s.cfg.MaxMediaFiles {
		return nil, syncResult{}, &appError{Code: "too_many_media_files", StatusCode: 400, Extra: map[string]any{"max": s.cfg.MaxMediaFiles, "current": current, "received": len(mediaParts), "next": next}}
	}

	data := map[string]string{
		"text":     parsed.Text,
		"category": parsed.Category,
		"location": parsed.Location,
		"status":   parsed.Status,
		"kind":     "memo",
	}
	if mediaOnlyUpdate {
		data["text"] = stringField(existing, "text")
		data["category"] = stringFieldDefault(existing, "category", parsed.Category)
		data["location"] = stringFieldDefault(existing, "location", parsed.Location)
		data["status"] = stringFieldDefault(existing, "status", parsed.Status)
		data["kind"] = stringFieldDefault(existing, "kind", "memo")
	}

	var deletes []formField
	if existing != nil && len(mediaParts) > 0 && mediaMode == "replace" {
		deletes = append(deletes, deleteExisting(existing, "media")...)
	}
	if existing != nil && len(posterParts) > 0 {
		deletes = append(deletes, deleteExisting(existing, "poster")...)
	}
	apiPath := fmt.Sprintf("/api/collections/%s/records", s.cfg.Collection)
	method := http.MethodPost
	if existing != nil {
		apiPath = fmt.Sprintf("/api/collections/%s/records/%s", s.cfg.Collection, parsed.RecordID)
		method = http.MethodPatch
	}
	record, status, body, err := s.pbWrite(ctx, token, method, apiPath, data, deletes, append(mediaParts, posterParts...))
	if err != nil {
		return nil, syncResult{}, err
	}
	if status >= 400 {
		return nil, syncResult{}, &appError{Code: "pocketbase_write_failed", StatusCode: 502, Extra: map[string]any{"detail": string(body), "pocketbase_status": status}}
	}
	var posterFile *fileInfo
	if len(posterInfo) > 0 {
		posterFile = &posterInfo[0]
	}
	return record, syncResult{MediaReceived: len(mediaParts), PosterReceived: len(posterParts) > 0, MediaFiles: mediaInfo, PosterFile: posterFile}, nil
}

func (s *server) readFormFiles(headers []*multipart.FileHeader, field string, allowed []string) ([]uploadPart, []fileInfo, error) {
	var parts []uploadPart
	var infos []fileInfo
	for _, header := range headers {
		if header.Filename == "" {
			continue
		}
		ct := header.Header.Get("Content-Type")
		if ct == "" {
			ct = "application/octet-stream"
		}
		if !isAllowedUpload(header.Filename, ct, allowed) {
			return nil, nil, &appError{Code: "unsupported_file_type", StatusCode: 400, Extra: map[string]any{"filename": header.Filename, "content_type": ct}}
		}
		if header.Size > s.cfg.MaxUploadBytes {
			return nil, nil, &appError{Code: "file_too_large", StatusCode: 413, Extra: map[string]any{"filename": header.Filename, "max_mb": s.cfg.MaxUploadBytes / 1024 / 1024}}
		}
		file, err := header.Open()
		if err != nil {
			return nil, nil, err
		}
		data, err := io.ReadAll(io.LimitReader(file, s.cfg.MaxUploadBytes+1))
		file.Close()
		if err != nil {
			return nil, nil, err
		}
		if int64(len(data)) > s.cfg.MaxUploadBytes {
			return nil, nil, &appError{Code: "file_too_large", StatusCode: 413, Extra: map[string]any{"filename": header.Filename, "max_mb": s.cfg.MaxUploadBytes / 1024 / 1024}}
		}
		if len(data) == 0 {
			continue
		}
		kind := uploadKind(header.Filename, ct)
		parts = append(parts, uploadPart{Field: field, Filename: header.Filename, ContentType: ct, Data: data, Size: int64(len(data)), Kind: kind})
		infos = append(infos, fileInfo{Filename: header.Filename, ContentType: ct, Size: int64(len(data)), Kind: kind})
	}
	return parts, infos, nil
}

func (s *server) pbWrite(ctx context.Context, token, method, apiPath string, data map[string]string, deletes []formField, uploads []uploadPart) (map[string]any, int, []byte, error) {
	record, status, body, err := s.pbWriteOnce(ctx, token, method, apiPath, data, deletes, uploads)
	if s.cfg.PBToken != "" || (status != 401 && status != 403) {
		return record, status, body, err
	}
	s.clearToken()
	nextToken, tokenErr := s.getPocketBaseToken(ctx)
	if tokenErr != nil {
		return nil, 0, nil, tokenErr
	}
	return s.pbWriteOnce(ctx, nextToken, method, apiPath, data, deletes, uploads)
}

type formField struct {
	Name  string
	Value string
}

func (s *server) pbWriteOnce(ctx context.Context, token, method, apiPath string, data map[string]string, deletes []formField, uploads []uploadPart) (map[string]any, int, []byte, error) {
	var body io.Reader
	contentType := "application/x-www-form-urlencoded"
	if len(uploads) == 0 && len(deletes) == 0 {
		values := url.Values{}
		for key, value := range data {
			values.Set(key, value)
		}
		body = strings.NewReader(values.Encode())
	} else {
		reader, writer := io.Pipe()
		multipartWriter := multipart.NewWriter(writer)
		contentType = multipartWriter.FormDataContentType()
		body = reader
		go func() {
			defer writer.Close()
			for key, value := range data {
				if err := multipartWriter.WriteField(key, value); err != nil {
					_ = writer.CloseWithError(err)
					return
				}
			}
			for _, field := range deletes {
				if err := multipartWriter.WriteField(field.Name, field.Value); err != nil {
					_ = writer.CloseWithError(err)
					return
				}
			}
			for _, upload := range uploads {
				header := make(textproto.MIMEHeader)
				header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, escapeQuotes(upload.Field), escapeQuotes(upload.Filename)))
				header.Set("Content-Type", upload.ContentType)
				part, err := multipartWriter.CreatePart(header)
				if err != nil {
					_ = writer.CloseWithError(err)
					return
				}
				if _, err := part.Write(upload.Data); err != nil {
					_ = writer.CloseWithError(err)
					return
				}
			}
			if err := multipartWriter.Close(); err != nil {
				_ = writer.CloseWithError(err)
				return
			}
		}()
	}
	req, err := http.NewRequestWithContext(ctx, method, s.cfg.PocketBaseURL+apiPath, body)
	if err != nil {
		return nil, 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", contentType)
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var decoded map[string]any
	_ = json.Unmarshal(raw, &decoded)
	return decoded, resp.StatusCode, raw, nil
}

func (s *server) importMemo(w http.ResponseWriter, r *http.Request) {
	reqID := requestID()
	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxArchiveBytes+s.cfg.MultipartMemory)
	if err := r.ParseMultipartForm(s.cfg.MultipartMemory); err != nil {
		fail(w, http.StatusBadRequest, reqID, "invalid_form", nil)
		return
	}
	if appErr := s.requireToken(r, r.FormValue("token"), reqID); appErr != nil {
		fail(w, appErr.StatusCode, reqID, appErr.Code, appErr.Extra)
		return
	}
	files := r.MultipartForm.File["archive"]
	if len(files) == 0 || files[0].Filename == "" || strings.ToLower(filepath.Ext(files[0].Filename)) != ".zip" {
		fail(w, http.StatusBadRequest, reqID, "archive_must_be_zip", nil)
		return
	}
	if files[0].Size > s.cfg.MaxArchiveBytes {
		fail(w, http.StatusRequestEntityTooLarge, reqID, "archive_too_large", map[string]any{"max_mb": s.cfg.MaxArchiveBytes / 1024 / 1024})
		return
	}
	archive, err := readArchiveFile(files[0], s.cfg.MaxArchiveBytes)
	if err != nil {
		handleErr(w, reqID, err)
		return
	}
	payload, err := s.readArchive(archive)
	if err != nil {
		handleErr(w, reqID, err)
		return
	}
	rawParsed := parseContent(payload.RawMarkdown, s.cfg)
	parsed := parseContent(payload.MemoText, s.cfg)
	if rawParsed.Kind == "note" {
		parsed = rawParsed
	}

	if parsed.Delete && parsed.RecordID == "" {
		fail(w, http.StatusBadRequest, reqID, "missing_id_for_delete", nil)
		return
	}
	if !parsed.Delete && parsed.Text == "" && parsed.RecordID == "" {
		fail(w, http.StatusBadRequest, reqID, "empty_text", nil)
		return
	}
	if !parsed.Delete && parsed.Text == "" && parsed.RecordID != "" && len(payload.Media) == 0 && !parsed.Hidden {
		fail(w, http.StatusBadRequest, reqID, "empty_text", nil)
		return
	}

	ctx := r.Context()
	token, err := s.getPocketBaseToken(ctx)
	if err != nil {
		handleErr(w, reqID, err)
		return
	}
	var existing map[string]any
	if parsed.RecordID != "" {
		record, found, err := s.getRecord(ctx, token, parsed.RecordID)
		if err != nil {
			handleErr(w, reqID, err)
			return
		}
		if !found {
			fail(w, http.StatusNotFound, reqID, "not_found", map[string]any{"id": parsed.RecordID})
			return
		}
		existing = record
	}
	if parsed.Delete {
		_, status, body, err := s.pbWrite(ctx, token, http.MethodPatch, fmt.Sprintf("/api/collections/%s/records/%s", s.cfg.Collection, parsed.RecordID), map[string]string{"status": "deleted"}, nil, nil)
		if err != nil {
			handleErr(w, reqID, err)
			return
		}
		if status >= 400 {
			fail(w, http.StatusBadGateway, reqID, "pocketbase_delete_failed", map[string]any{"detail": string(body), "pocketbase_status": status})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "request_id": reqID, "action": "deleted", "id": parsed.RecordID, "status": "deleted"})
		return
	}

	record, err := s.submitImport(ctx, token, parsed, existing, payload)
	if err != nil {
		handleErr(w, reqID, err)
		return
	}
	rewritten := 0
	if parsed.Kind == "note" {
		var next map[string]any
		next, rewritten, err = s.rewriteNoteText(ctx, token, record, payload, parsed.Text)
		if err != nil {
			handleErr(w, reqID, err)
			return
		}
		if next != nil {
			record = next
		}
	}

	action := "created"
	if existing != nil {
		action = "updated"
	}
	if parsed.Hidden && existing != nil {
		action = "hidden"
	}
	savedMedia := fileNames(record["media"])
	finalText := stringField(record, "text")
	log.Printf("event=success request_id=%s action=%s id=%s markdown_found=true attachments=%d images=%d videos=%d media_saved=%d text_length=%d kind=%s rewritten_images=%d", reqID, action, stringField(record, "id"), len(payload.Media), countPartsKind(payload.Media, "image"), countPartsKind(payload.Media, "video"), len(savedMedia), len([]rune(finalText)), parsed.Kind, rewritten)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "request_id": reqID, "action": action, "id": stringField(record, "id"),
		"category": stringField(record, "category"), "location": stringField(record, "location"), "status": stringField(record, "status"),
		"content": map[string]any{"kind": stringFieldDefault(record, "kind", parsed.Kind), "markdown": parsed.Kind == "note", "rewritten_images": rewritten},
		"archive": map[string]any{"markdown_found": true, "attachments": len(payload.Media), "images": countPartsKind(payload.Media, "image"), "videos": countPartsKind(payload.Media, "video")},
		"text": map[string]any{"length": len([]rune(finalText)), "empty": finalText == ""},
		"media": map[string]any{"received": len(payload.Media), "saved": len(savedMedia), "files": safeStringSlice(savedMedia), "received_files": partsInfo(payload.Media)},
	})
}

func readArchiveFile(header *multipart.FileHeader, maxBytes int64) ([]byte, error) {
	file, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, &appError{Code: "archive_too_large", StatusCode: 413, Extra: map[string]any{"max_mb": maxBytes / 1024 / 1024}}
	}
	return data, nil
}

func (s *server) readArchive(data []byte) (archivePayload, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return archivePayload{}, &appError{Code: "invalid_archive", StatusCode: 400}
	}
	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		name, err := cleanZipName(file.Name)
		if err != nil {
			return archivePayload{}, err
		}
		if shouldIgnoreZipEntry(name) {
			continue
		}
		entries[name] = file
	}
	var markdownFiles []string
	for name := range entries {
		if strings.ToLower(filepath.Ext(name)) == ".md" {
			markdownFiles = append(markdownFiles, name)
		}
	}
	sort.Strings(markdownFiles)
	if len(markdownFiles) == 0 {
		return archivePayload{}, &appError{Code: "markdown_not_found", StatusCode: 400}
	}
	if len(markdownFiles) > 1 {
		return archivePayload{}, &appError{Code: "multiple_markdown_files", StatusCode: 400, Extra: map[string]any{"files": markdownFiles}}
	}
	mdName := markdownFiles[0]
	mdText, err := readZipText(entries[mdName])
	if err != nil {
		return archivePayload{}, err
	}
	mdText = strings.TrimPrefix(mdText, "\ufeff")
	mdParent := path.Dir(mdName)
	if mdParent == "." {
		mdParent = ""
	}
	var attachmentPaths []string
	for name := range entries {
		parent := path.Dir(name)
		if strings.EqualFold(path.Base(parent), "attachments") && cleanDir(path.Dir(parent)) == mdParent {
			attachmentPaths = append(attachmentPaths, name)
		}
	}
	sort.Strings(attachmentPaths)
	attachmentPaths = orderAttachmentPaths(mdText, mdParent, attachmentPaths)

	payload := archivePayload{MarkdownParent: mdParent, RawMarkdown: strings.TrimSpace(mdText), MemoText: stripMarkdownAttachmentImages(mdText)}
	for _, itemPath := range attachmentPaths {
		file := entries[itemPath]
		filename := path.Base(itemPath)
		ct := guessContentType(filename)
		if !isAllowedMedia(filename, ct) {
			return archivePayload{}, &appError{Code: "unsupported_file_type", StatusCode: 400, Extra: map[string]any{"filename": filename, "content_type": ct}}
		}
		content, err := readZipBytes(file, s.cfg.MaxUploadBytes)
		if err != nil {
			return archivePayload{}, err
		}
		if len(content) == 0 {
			continue
		}
		payload.Media = append(payload.Media, uploadPart{Field: "media", Filename: filename, ContentType: ct, Data: content, Size: int64(len(content)), Kind: uploadKind(filename, ct)})
		payload.MediaPaths = append(payload.MediaPaths, itemPath)
	}
	return payload, nil
}

func readZipText(file *zip.File) (string, error) {
	rc, err := file.Open()
	if err != nil {
		return "", err
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func readZipBytes(file *zip.File, maxBytes int64) ([]byte, error) {
	if int64(file.UncompressedSize64) > maxBytes {
		return nil, &appError{Code: "file_too_large", StatusCode: 413, Extra: map[string]any{"filename": path.Base(file.Name), "max_mb": maxBytes / 1024 / 1024}}
	}
	rc, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, &appError{Code: "file_too_large", StatusCode: 413, Extra: map[string]any{"filename": path.Base(file.Name), "max_mb": maxBytes / 1024 / 1024}}
	}
	return data, nil
}

func (s *server) submitImport(ctx context.Context, token string, parsed parsedMemo, existing map[string]any, payload archivePayload) (map[string]any, error) {
	hasMedia := len(payload.Media) > 0
	partialUpdate := existing != nil && parsed.Text == "" && (hasMedia || parsed.Hidden)
	data := map[string]string{
		"text": parsed.Text, "category": parsed.Category, "location": parsed.Location, "status": parsed.Status, "kind": parsed.Kind,
	}
	if partialUpdate {
		data["text"] = stringField(existing, "text")
		data["category"] = stringFieldDefault(existing, "category", parsed.Category)
		data["location"] = stringFieldDefault(existing, "location", parsed.Location)
		data["status"] = stringFieldDefault(existing, "status", parsed.Status)
		if parsed.Hidden {
			data["status"] = parsed.Status
		}
		data["kind"] = stringFieldDefault(existing, "kind", "memo")
	}
	existingVideos := 0
	if !hasMedia {
		existingVideos = countExistingVideos(existing)
	}
	if existingVideos+countPartsKind(payload.Media, "video") > 1 {
		return nil, &appError{Code: "multiple_videos_not_supported", StatusCode: 400}
	}
	if hasMedia && len(payload.Media) > s.cfg.MaxMediaFiles {
		return nil, &appError{Code: "too_many_media_files", StatusCode: 400, Extra: map[string]any{"max": s.cfg.MaxMediaFiles, "received": len(payload.Media), "next": len(payload.Media)}}
	}
	var deletes []formField
	if existing != nil && hasMedia {
		deletes = append(deletes, deleteExisting(existing, "media")...)
	}
	apiPath := fmt.Sprintf("/api/collections/%s/records", s.cfg.Collection)
	method := http.MethodPost
	if existing != nil {
		apiPath = fmt.Sprintf("/api/collections/%s/records/%s", s.cfg.Collection, parsed.RecordID)
		method = http.MethodPatch
	}
	record, status, body, err := s.pbWrite(ctx, token, method, apiPath, data, deletes, payload.Media)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, &appError{Code: "pocketbase_write_failed", StatusCode: 502, Extra: map[string]any{"detail": string(body), "pocketbase_status": status}}
	}
	return record, nil
}

func (s *server) rewriteNoteText(ctx context.Context, token string, record map[string]any, payload archivePayload, markdownText string) (map[string]any, int, error) {
	id := stringField(record, "id")
	saved := fileNames(record["media"])
	if id == "" || len(saved) == 0 {
		return nil, 0, nil
	}
	text, rewritten := s.rewriteMarkdownAttachmentImages(markdownText, payload.MarkdownParent, payload.MediaPaths, saved, id)
	if rewritten == 0 {
		return nil, 0, nil
	}
	next, status, body, err := s.pbWrite(ctx, token, http.MethodPatch, fmt.Sprintf("/api/collections/%s/records/%s", s.cfg.Collection, id), map[string]string{"text": text}, nil, nil)
	if err != nil {
		return nil, 0, err
	}
	if status >= 400 {
		return nil, 0, &appError{Code: "pocketbase_markdown_rewrite_failed", StatusCode: 502, Extra: map[string]any{"detail": string(body), "pocketbase_status": status}}
	}
	return next, rewritten, nil
}

func (s *server) rewriteMarkdownAttachmentImages(markdown, markdownParent string, originalPaths, savedFiles []string, recordID string) (string, int) {
	replacements := map[string]string{}
	for i, item := range originalPaths {
		if i < len(savedFiles) {
			replacements[item] = fmt.Sprintf("%s/api/files/%s/%s/%s", s.cfg.PocketBasePublic, s.cfg.Collection, recordID, savedFiles[i])
		}
	}
	rewritten := 0
	text := imageRefRe.ReplaceAllStringFunc(markdown, func(match string) string {
		groups := imageRefRe.FindStringSubmatch(match)
		if len(groups) < 2 {
			return match
		}
		ref := strings.TrimSpace(groups[1])
		wrapped := strings.HasPrefix(ref, "<") && strings.HasSuffix(ref, ">")
		clean := ref
		if wrapped {
			clean = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(ref, "<"), ">"))
		}
		unescaped, _ := url.PathUnescape(clean)
		archivePath := archiveRefPath(markdownParent, unescaped)
		next, ok := replacements[archivePath]
		if !ok {
			return match
		}
		rewritten++
		if wrapped {
			next = "<" + next + ">"
		}
		return strings.Replace(match, ref, next, 1)
	})
	return strings.TrimSpace(collapseBlankLines(text)), rewritten
}

func stripMarkdownAttachmentImages(markdown string) string {
	text := imageLineRe.ReplaceAllString(markdown, "")
	text = imageInlineRe.ReplaceAllString(text, "")
	return strings.TrimSpace(collapseBlankLines(text))
}

func markdownImageRefs(markdown string) []string {
	matches := imageRefRe.FindAllStringSubmatch(markdown, -1)
	refs := make([]string, 0, len(matches))
	for _, match := range matches {
		ref := strings.TrimSpace(match[1])
		if strings.HasPrefix(ref, "<") && strings.HasSuffix(ref, ">") {
			ref = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(ref, "<"), ">"))
		}
		if unescaped, err := url.PathUnescape(ref); err == nil {
			ref = unescaped
		}
		if ref != "" {
			refs = append(refs, ref)
		}
	}
	return refs
}

func archiveRefPath(markdownParent, ref string) string {
	if strings.Contains(ref, "://") || strings.HasPrefix(ref, "#") || strings.HasPrefix(ref, "/") {
		return ""
	}
	joined := path.Clean(path.Join(markdownParent, strings.ReplaceAll(ref, "\\", "/")))
	if joined == "." {
		return ""
	}
	if strings.HasPrefix(joined, "../") || joined == ".." || strings.HasPrefix(joined, "/") {
		return ""
	}
	return joined
}

func cleanDir(value string) string {
	if value == "." {
		return ""
	}
	return value
}

func orderAttachmentPaths(markdownText, markdownParent string, attachmentPaths []string) []string {
	remaining := map[string]bool{}
	for _, item := range attachmentPaths {
		remaining[item] = true
	}
	ordered := []string{}
	for _, ref := range markdownImageRefs(markdownText) {
		item := archiveRefPath(markdownParent, ref)
		if remaining[item] {
			ordered = append(ordered, item)
			delete(remaining, item)
		}
	}
	for _, item := range attachmentPaths {
		if remaining[item] {
			ordered = append(ordered, item)
		}
	}
	return ordered
}

func cleanZipName(name string) (string, error) {
	normalized := path.Clean(strings.ReplaceAll(name, "\\", "/"))
	if normalized == "." {
		return "", &appError{Code: "unsafe_archive_path", StatusCode: 400, Extra: map[string]any{"path": name}}
	}
	if strings.HasPrefix(normalized, "../") || normalized == ".." || strings.HasPrefix(normalized, "/") {
		return "", &appError{Code: "unsafe_archive_path", StatusCode: 400, Extra: map[string]any{"path": name}}
	}
	return normalized, nil
}

func shouldIgnoreZipEntry(name string) bool {
	for _, part := range strings.Split(name, "/") {
		if part == "__MACOSX" || strings.HasPrefix(part, ".") {
			return true
		}
	}
	return false
}

func handleErr(w http.ResponseWriter, requestID string, err error) {
	var appErr *appError
	if errors.As(err, &appErr) {
		log.Printf("event=error request_id=%s error=%s status_code=%d", requestID, appErr.Code, appErr.StatusCode)
		fail(w, appErr.StatusCode, requestID, appErr.Code, appErr.Extra)
		return
	}
	log.Printf("event=error request_id=%s error=internal detail=%q", requestID, err.Error())
	fail(w, http.StatusInternalServerError, requestID, "internal_error", nil)
}

func isAllowedUpload(filename, contentType string, allowed []string) bool {
	for _, prefix := range allowed {
		if strings.HasPrefix(contentType, prefix) {
			return true
		}
	}
	if contentType != "application/octet-stream" {
		return false
	}
	ext := strings.ToLower(filepath.Ext(filename))
	for _, prefix := range allowed {
		if prefix == "image/" && imageExts[ext] {
			return true
		}
		if prefix == "video/" && videoExts[ext] {
			return true
		}
	}
	return false
}

func isAllowedMedia(filename, contentType string) bool {
	kind := uploadKind(filename, contentType)
	return kind == "image" || kind == "video"
}

func uploadKind(filename, contentType string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if strings.HasPrefix(contentType, "video/") || videoExts[ext] {
		return "video"
	}
	if strings.HasPrefix(contentType, "image/") || imageExts[ext] {
		return "image"
	}
	return "unknown"
}

func guessContentType(filename string) string {
	if guessed := mime.TypeByExtension(strings.ToLower(filepath.Ext(filename))); guessed != "" {
		return guessed
	}
	return "application/octet-stream"
}

func fileNames(value any) []string {
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return nil
		}
		return []string{typed}
	case []any:
		out := []string{}
		for _, item := range typed {
			if text, ok := item.(string); ok && text != "" {
				out = append(out, text)
			}
		}
		return out
	case []string:
		return typed
	default:
		return nil
	}
}

func fileName(value any) string {
	names := fileNames(value)
	if len(names) == 0 {
		return ""
	}
	return names[0]
}

func safeFileNames(value any) []string {
	return safeStringSlice(fileNames(value))
}

func safeStringSlice(value []string) []string {
	if value == nil {
		return []string{}
	}
	return value
}

func safeFileInfos(value []fileInfo) []fileInfo {
	if value == nil {
		return []fileInfo{}
	}
	return value
}

func stringField(record map[string]any, key string) string {
	if record == nil {
		return ""
	}
	if value, ok := record[key].(string); ok {
		return value
	}
	return ""
}

func stringFieldDefault(record map[string]any, key, fallback string) string {
	value := stringField(record, key)
	if value == "" {
		return fallback
	}
	return value
}

func hasExistingMedia(record map[string]any) bool {
	if record == nil {
		return false
	}
	return len(fileNames(record["media"])) > 0
}

func countExistingVideos(record map[string]any) int {
	if record == nil {
		return 0
	}
	count := 0
	for _, name := range fileNames(record["media"]) {
		if uploadKind(name, "application/octet-stream") == "video" {
			count++
		}
	}
	return count
}

func countInfoKind(files []fileInfo, kind string) int {
	count := 0
	for _, file := range files {
		if file.Kind == kind {
			count++
		}
	}
	return count
}

func countPartsKind(files []uploadPart, kind string) int {
	count := 0
	for _, file := range files {
		if file.Kind == kind {
			count++
		}
	}
	return count
}

func mediaCountAfterWrite(existing map[string]any, received int, mode string) (int, int) {
	current := 0
	if existing != nil {
		current = len(fileNames(existing["media"]))
	}
	if mode == "append" {
		return current, current + received
	}
	return current, received
}

func deleteExisting(record map[string]any, field string) []formField {
	out := []formField{}
	for _, name := range fileNames(record[field]) {
		out = append(out, formField{Name: field + "-", Value: name})
	}
	return out
}

func partsInfo(parts []uploadPart) []fileInfo {
	out := make([]fileInfo, 0, len(parts))
	for _, part := range parts {
		out = append(out, fileInfo{Filename: part.Filename, ContentType: part.ContentType, Size: part.Size, Kind: part.Kind})
	}
	return out
}

func collapseBlankLines(text string) string {
	re := regexp.MustCompile(`\n{3,}`)
	return re.ReplaceAllString(text, "\n\n")
}

func escapeQuotes(value string) string {
	return strings.ReplaceAll(value, `"`, `\"`)
}
