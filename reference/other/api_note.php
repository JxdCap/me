<?php
/**
 * ===================================================================================
 *  Typecho Intelligent Memo API (v5.0 Stable)
 *  
 *  [核心功能]
 *  1. 智能增改 (Upsert): 基于 @uuid 自动判断是新增还是更新。
 *  2. 物理删除 (Delete): 正文包含 @del 或 @delete 时彻底删除文章。
 *  3. 时间控制 (Time):   @time:2020-01-01 可穿越时间，无则使用当前时间。
 *  4. 隐私控制 (Hide):   正文包含 @hide 或 @hidden 即设为私密。
 *  5. 自动分类 (Meta):   自动解析 @cate:分类名 和 #标签。
 *
 *  [指令规范]
 *  - 带参: @uuid:xxx, @time:yyyy-mm-dd HH:ii:ss, @cate:分类名
 *  - 开关: @hide, @del (无需参数，出现即生效)
 * ===================================================================================
 */

// 🔧 调试开关 (部署时设为 false)
define('DEBUG_MODE', false); 

// ================= 1. 用户配置中心 =================

$config = [
    // 数据库配置
    'db_host'   => 'mysql',
    'db_user'   => 'typecho_blog',
    'db_pass'   => 'Jxd19921227',
    'db_name'   => 'typecho_blog',
    'prefix'    => 'typecho_', // 表前缀
    
    // API 安全配置
    'api_pwd'   => 'Jxd19921227', // iOS快捷指令中填写的密码
    
    // 博客默认设置
    'author_id' => 1,    // 作者UID (通常管理员是1)
    'def_cid'   => 1,    // 默认分类ID (如果没有指定分类)
    'max_title' => 200   // 标题截断长度
];

// =================================================

// 环境初始化
mb_internal_encoding('UTF-8'); 
date_default_timezone_set('Asia/Shanghai'); 
header('Content-Type: application/json; charset=utf-8');

if (!DEBUG_MODE) {
    error_reporting(0);
    mysqli_report(MYSQLI_REPORT_OFF);
} else {
    error_reporting(E_ALL);
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
}

// 1. 入口鉴权
$input_pass  = $_POST['password'] ?? '';
$raw_content = $_POST['content'] ?? '';

if ($config['api_pwd'] !== $input_pass) {
    response_fail('🚫 鉴权失败：API密码错误', 401);
}

if (trim($raw_content) === '') {
    response_fail('⚠️ 内容为空');
}

$conn = null;

try {
    // 数据库连接
    $conn = new mysqli($config['db_host'], $config['db_user'], $config['db_pass'], $config['db_name']);
    if ($conn->connect_error) throw new Exception("Database Connection Failed");
    $conn->set_charset("utf8mb4"); 
    $conn->query("SET time_zone = '+08:00'");

    // 2. 解析正文
    $parsed = parse_content($raw_content, $config['max_title']);
    
    // 开启事务 (原子性操作)
    $conn->begin_transaction();

    try {
        $cid = 0;
        $is_exist = false;
        $target_uuid = $parsed['uuid']; 

        // --- 核心查找逻辑 (Upsert的基础) ---
        if (!empty($target_uuid)) {
            // 策略A: 查 Slug (官方唯一标识)
            $stmt_slug = $conn->prepare("SELECT cid FROM {$config['prefix']}contents WHERE slug = ? LIMIT 1");
            $stmt_slug->bind_param("s", $target_uuid);
            $stmt_slug->execute();
            $res_slug = $stmt_slug->get_result();
            if ($row = $res_slug->fetch_assoc()) {
                $cid = $row['cid'];
                $is_exist = true;
            }
            $stmt_slug->close();

            // 策略B: 查自定义字段 (兼容性查找)
            if (!$is_exist) {
                $stmt_field = $conn->prepare("SELECT cid FROM {$config['prefix']}fields WHERE name = 'memo_uuid' AND str_value = ? LIMIT 1");
                $stmt_field->bind_param("s", $target_uuid);
                $stmt_field->execute();
                $res_field = $stmt_field->get_result();
                if ($row = $res_field->fetch_assoc()) {
                    $cid = $row['cid'];
                    $is_exist = true;
                }
                $stmt_field->close();
            }
        }

        // ==========================================
        //  ⛔️ 删除分支 (DELETE)
        // ==========================================
        if ($parsed['is_delete']) {
            if ($is_exist && $cid > 0) {
                // 1. 维护 Metas 计数 (文章数 -1)
                $sql_meta_decr = "UPDATE {$config['prefix']}metas m 
                                  INNER JOIN {$config['prefix']}relationships r ON m.mid = r.mid 
                                  SET m.count = m.count - 1 
                                  WHERE r.cid = ?";
                $stmt_decr = $conn->prepare($sql_meta_decr);
                $stmt_decr->bind_param("i", $cid);
                $stmt_decr->execute();
                $stmt_decr->close();

                // 2. 清理所有关联表
                $conn->query("DELETE FROM {$config['prefix']}relationships WHERE cid = $cid");
                $conn->query("DELETE FROM {$config['prefix']}fields WHERE cid = $cid");
                $conn->query("DELETE FROM {$config['prefix']}comments WHERE cid = $cid"); 
                
                // 3. 删除主表数据
                $conn->query("DELETE FROM {$config['prefix']}contents WHERE cid = $cid");
            }
            
            $conn->commit();
            
            // 删除成功后直接返回
            echo json_encode(['status' => 'success', 'action' => 'deleted', 'uuid' => $target_uuid]);
            exit; 
        }

        // ==========================================
        //  🔄 增改分支 (INSERT / UPDATE)
        // ==========================================
        
        $post_status = $parsed['is_hidden'] ? 'private' : 'publish';
        $final_text = "<!--markdown-->" . $parsed['body']; 
        
        // 时间逻辑：有指定用指定，无指定用当前
        $created_time = time(); 
        if (!empty($parsed['time'])) {
            $created_time = parse_custom_time($parsed['time']);
        }

        if ($is_exist) {
            // --- UPDATE (更新模式) ---
            $mod_time = time(); // 修改时间永远是当前操作时间
            
            // 关键：created 字段也会被强制更新为 $created_time
            $sql_update = "UPDATE {$config['prefix']}contents SET title = ?, text = ?, created = ?, modified = ?, status = ? WHERE cid = ?";
            $stmt = $conn->prepare($sql_update);
            $stmt->bind_param("ssiisi", $parsed['title'], $final_text, $created_time, $mod_time, $post_status, $cid);
            $stmt->execute();
            $stmt->close();

            // 清理旧 Meta 计数，方便后面重新绑定
            $sql_meta_decr = "UPDATE {$config['prefix']}metas m 
                              INNER JOIN {$config['prefix']}relationships r ON m.mid = r.mid 
                              SET m.count = m.count - 1 
                              WHERE r.cid = ?";
            $stmt_decr = $conn->prepare($sql_meta_decr);
            $stmt_decr->bind_param("i", $cid);
            $stmt_decr->execute();
            $stmt_decr->close();

            // 删除旧关系，准备重建
            $conn->query("DELETE FROM {$config['prefix']}relationships WHERE cid = $cid");
            $conn->query("DELETE FROM {$config['prefix']}fields WHERE cid = $cid");

        } else {
            // --- INSERT (新增模式) ---
            
            // Slug 生成逻辑优化：保证唯一性
            if (!empty($target_uuid)) {
                $slug = $target_uuid;
            } else {
                // 如果没有 uuid，生成一个随机唯一 slug，防止冲突
                $slug = uniqid(date('Ymd_')); 
            }
            // 清理非法字符
            $slug = preg_replace('/[^a-zA-Z0-9_-]/', '', $slug);

            $sql_insert = "INSERT INTO {$config['prefix']}contents 
                (title, slug, created, modified, text, authorId, type, status, allowComment, allowPing, allowFeed) 
                VALUES (?, ?, ?, ?, ?, ?, 'post', ?, 1, 1, 1)";
            
            $stmt = $conn->prepare($sql_insert);
            $stmt->bind_param("ssiisis", $parsed['title'], $slug, $created_time, $created_time, $final_text, $config['author_id'], $post_status);
            
            if (!$stmt->execute()) throw new Exception("Insert Failed: " . $stmt->error);
            $cid = $stmt->insert_id;
            $stmt->close();
        }

        // --- 重建关联 (分类 & 标签) ---
        // 1. 处理分类
        $mid_cate = $config['def_cid'];
        if (!empty($parsed['cate_name'])) {
            $mid_cate = ensure_meta($conn, $config['prefix'], 'category', $parsed['cate_name']);
        }
        add_relation($conn, $config['prefix'], $cid, $mid_cate);

        // 2. 处理标签
        foreach ($parsed['tags'] as $tag_name) {
            $mid_tag = ensure_meta($conn, $config['prefix'], 'tag', $tag_name);
            add_relation($conn, $config['prefix'], $cid, $mid_tag);
        }

        // --- 写入自定义字段 (Fields) ---
        $stmt_f = $conn->prepare("INSERT INTO {$config['prefix']}fields 
            (cid, name, type, str_value, int_value, float_value) VALUES (?, ?, 'str', ?, 0, 0)");
        
        // 写入普通解析出的字段
        if (!empty($parsed['fields'])) {
            foreach ($parsed['fields'] as $k => $v) {
                $stmt_f->bind_param("iss", $cid, $k, $v);
                $stmt_f->execute();
            }
        }
        
        // 始终写入 memo_uuid 以便未来查询兼容
        if (!empty($target_uuid)) {
            $uuid_key = 'memo_uuid';
            $stmt_f->bind_param("iss", $cid, $uuid_key, $target_uuid);
            $stmt_f->execute();
        }
        
        $stmt_f->close();
        $conn->commit();
        
        // --- 构造精简的返回结果 ---
        $response = [
            'status' => 'success',
            'action' => $is_exist ? 'updated' : 'created',
            'id'     => $cid,
            'title'  => $parsed['title'],
            'uuid'   => $target_uuid,
            'time'   => date('Y-m-d H:i:s', $created_time)
        ];

        // 仅在私密时显示 is_hidden
        if ($parsed['is_hidden']) {
            $response['is_hidden'] = true;
        }

        echo json_encode($response);

    } catch (Exception $e) {
        $conn->rollback();
        throw $e; 
    }

} catch (Exception $e) {
    response_fail('System Error: ' . $e->getMessage());
} finally {
    if ($conn) $conn->close();
}

// =================================================
// 🧩 核心解析函数库
// =================================================

/**
 * 解析正文，提取元数据
 */
function parse_content($raw, $max_title_len) {
    $text = str_replace(["\r\n", "\r"], "\n", $raw);
    $lines = explode("\n", $text);
    
    $fields = [];
    $valid_lines = [];
    $cate_name = '';
    $uuid = ''; 
    $is_hidden = false;
    $is_delete = false; 
    $custom_time = null;

    // 1. 预处理：逐行扫描指令
    foreach ($lines as $line) {
        $t_line = trim($line);
        // 正则：匹配 @key:value 或 @switch，兼容中英文冒号和空格
        if (strpos($t_line, '@') === 0 && preg_match('/^@([^:：\s]+)(?:[:：\s]\s*(.*))?$/u', $t_line, $matches)) {
            $k = strtolower(trim($matches[1]));
            $v = isset($matches[2]) ? trim($matches[2]) : '';
            
            if (in_array($k, ['cate', 'category', 'cat'])) {
                $cate_name = $v;
            } elseif ($k === 'uuid') {
                $uuid = $v;
            } elseif ($k === 'time') {
                $custom_time = $v;
            } elseif ($k === 'hide' || $k === 'hidden') {
                $is_hidden = true; // 只要出现即为真
            } elseif ($k === 'delete' || $k === 'del') {
                $is_delete = true; // 只要出现即为真
            } else {
                if ($v !== '') $fields[$k] = $v; 
            }
        } else {
            $valid_lines[] = $line;
        }
    }

    // 2. 提取标题 (第一行非空非图片文本)
    $title_index = -1;
    $title_text = '';
    $img_pattern = '/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|heic|bmp)(\?.*)?$/i';

    foreach ($valid_lines as $idx => $line) {
        $t = trim($line);
        $is_img = preg_match($img_pattern, $t);
        if ($t !== '' && !$is_img) {
            $title_index = $idx;
            $title_text = $t;
            break; 
        }
    }

    if ($title_index === -1) {
        // 兜底标题
        $date_for_title = $custom_time ? $custom_time : date('Y年m月d日 H:i');
        $title_text = $date_for_title . ' 的碎碎念';
    } else {
        $title_text = mb_substr($title_text, 0, $max_title_len);
    }

    // 3. 提取正文 (去除已提取的标题行)
    $temp_body_lines = [];
    $has_title_been_skipped = false;

    foreach ($valid_lines as $idx => $line) {
        // 如果这行是标题行，且后面还有内容，则跳过标题行
        if ($idx === $title_index && !$has_title_been_skipped) {
            $has_title_been_skipped = true;
            // 检查标题后是否还有实际内容
            $remaining_content = false;
            for ($i = $idx + 1; $i < count($valid_lines); $i++) {
                 if (trim($valid_lines[$i]) !== '') { $remaining_content = true; break; }
            }
            if ($remaining_content) continue; // 如果后面有内容，这一行仅作为标题，不存入正文
        }
        
        $t = trim($line);
        // 图片转 Markdown 语法
        if (preg_match($img_pattern, $t)) {
            $temp_body_lines[] = "![]($t)";
        } else {
            $temp_body_lines[] = $line; 
        }
    }

    // 4. 提取 #标签 并从正文中移除
    $full_scan_text = implode("\n", $temp_body_lines); 
    $tags = [];
    $tag_pattern = '/#([\x{4e00}-\x{9fa5}a-zA-Z0-9_]+)/u';
    
    if (preg_match_all($tag_pattern, $full_scan_text, $matches)) {
        $tags = array_unique($matches[1]);
    }

    $final_cleaned_lines = [];
    foreach ($temp_body_lines as $line) {
        if (trim($line) === '') {
            $final_cleaned_lines[] = ''; 
            continue;
        }
        $line_removed_tags = preg_replace($tag_pattern, '', $line);
        $line_clean = trim($line_removed_tags);
        if ($line_clean !== '') {
            $final_cleaned_lines[] = $line_clean;
        }
    }

    $clean_body = implode("\n", $final_cleaned_lines);
    if (trim($clean_body) === '') {
        $clean_body = $title_text; // 如果正文被删空了，用标题填充
    }

    return [
        'title'     => $title_text,
        'body'      => $clean_body,
        'cate_name' => $cate_name,
        'tags'      => $tags,
        'fields'    => $fields,
        'uuid'      => $uuid,
        'time'      => $custom_time, 
        'is_hidden' => $is_hidden,
        'is_delete' => $is_delete 
    ];
}

/**
 * 智能时间解析助手
 */
function parse_custom_time($time_str) {
    $timezone = new DateTimeZone('Asia/Shanghai');
    $formats = ['Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d'];
    
    foreach ($formats as $fmt) {
        $dt = DateTime::createFromFormat($fmt, $time_str, $timezone);
        if ($dt) {
            if ($fmt === 'Y-m-d') {
                $dt->setTime(date('H'), date('i'), date('s')); // 补全当前时分秒
            }
            return $dt->getTimestamp();
        }
    }
    return time(); // 解析失败降级为当前时间
}

/**
 * 确保元数据(Meta)存在，返回 mid
 */
function ensure_meta($conn, $prefix, $type, $name) {
    if (empty($name)) return 0;
    $stmt = $conn->prepare("SELECT mid FROM {$prefix}metas WHERE type = ? AND name = ? LIMIT 1");
    $stmt->bind_param("ss", $type, $name);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) return $row['mid'];
    
    $slug = $name; 
    $stmt_in = $conn->prepare("INSERT INTO {$prefix}metas (name, slug, type, count, `order`, parent) VALUES (?, ?, ?, 0, 0, 0)");
    $stmt_in->bind_param("sss", $name, $slug, $type);
    if ($stmt_in->execute()) return $stmt_in->insert_id;
    return 0;
}

/**
 * 建立文章与Meta的关联
 */
function add_relation($conn, $prefix, $cid, $mid) {
    if (!$mid) return;
    $sql = "INSERT IGNORE INTO {$prefix}relationships (cid, mid) VALUES ($cid, $mid)";
    if ($conn->query($sql) === TRUE && $conn->affected_rows > 0) {
        $conn->query("UPDATE {$prefix}metas SET count = count + 1 WHERE mid = $mid");
    }
}

/**
 * 标准错误响应
 */
function response_fail($msg, $code = 500) {
    http_response_code($code);
    exit(json_encode(['status' => 'error', 'msg' => $msg], JSON_UNESCAPED_UNICODE));
}
?>
