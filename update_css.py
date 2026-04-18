import re

with open('web/src/styles/home.css', 'r') as f:
    css = f.read()

# We want to keep everything before '.hero {'
split_point = css.find('.hero {')
if split_point != -1:
    top_part = css[:split_point]
else:
    top_part = css # fallback

new_css = """
.hero {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 0 16px;
  flex-shrink: 0;
}

.hero-compact-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.hero-avatar-placeholder {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(255,255,255,0.98), rgba(243,243,241,0.94));
  border: 1px solid rgba(236,236,236,0.94);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.92), 0 8px 16px rgba(15,23,42,0.05);
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.hero-avatar-placeholder::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), transparent 60%);
}

.hero-copy h1 {
  font-size: clamp(20px, 5.5vw, 26px);
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: #111111;
  margin: 0;
}

.hero-skills {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.skill-tag {
  min-height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(235, 236, 238, 0.96);
  background: rgba(251, 251, 250, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.94);
  font-size: 13px;
  color: #626b78;
  cursor: pointer;
  transition: all 200ms ease;
}

.skill-tag.active {
  background: #111;
  color: #fff;
  border-color: #111;
}

.skill-content-container {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.skill-content-container.expanded {
  grid-template-rows: 1fr;
}

.skill-content-inner {
  overflow: hidden;
}

.skill-content-inner p {
  padding: 12px 16px;
  margin: 0;
  background: rgba(245, 245, 245, 0.6);
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: #444;
}

.status-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-top: 12px;
  min-height: 0; /* Important for flex child with hidden overflow */
}

.section-heading-compact {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-heading-compact h2 {
  font-size: 16px;
  font-weight: 600;
  color: #111;
}

.status-hint {
  font-size: 12px;
  color: #888;
}

.stacked-cards.ios-style {
  position: relative;
  flex: 1;
  width: 100%;
  touch-action: pan-x pan-y;
  outline: none;
}

.ios-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: clamp(120px, 30vh, 160px);
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,249,0.96));
  border: 1px solid rgba(235, 236, 238, 0.98);
  border-radius: 24px;
  padding: 16px 20px;
  box-shadow: 
    0 12px 24px rgba(0,0,0,0.04),
    inset 0 1px 0 rgba(255,255,255,0.9);
  transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1), 
              opacity 400ms ease,
              z-index 400ms ease;
  
  /* Downward Stack Logic */
  transform: translateY(calc(var(--card-index) * 12px)) scale(calc(1 - var(--card-index) * 0.05));
  opacity: calc(1 - var(--card-index) * 0.2);
  z-index: calc(10 - var(--card-index));
  will-change: transform, opacity;
}

.ios-card[data-card-index="0"] {
  box-shadow: 
    0 16px 32px rgba(0,0,0,0.06),
    inset 0 1px 0 rgba(255,255,255,0.9);
}

/* Hide cards beyond the 3rd layer */
.ios-card[data-card-index="3"],
.ios-card[data-card-index="4"] {
  opacity: 0;
  pointer-events: none;
}

.ios-card.swiping-up {
  transform: translateY(-80px) scale(1.02);
  opacity: 0;
}

.ios-card-content {
  display: flex;
  gap: 16px;
  height: 100%;
}

.ios-card-text-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ios-card-time {
  font-size: 12px;
  color: #87919f;
  margin: 0;
}

.ios-card-text {
  font-size: 15px;
  line-height: 1.5;
  color: #18181b;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ios-card-thumbnail {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  background: #f0f0f0;
}

.ios-card-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (min-width: 840px) {
  /* PC Fallback: Center the mobile view */
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f7;
  }
  
  #root {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .page-shell {
    height: 800px; /* Fixed height for PC container */
    max-height: 90vh;
    border-radius: 40px;
    background: #fff;
    box-shadow: 0 24px 64px rgba(0,0,0,0.08);
    border: 8px solid #fff;
    overflow: hidden;
  }
}
"""

with open('web/src/styles/home.css', 'w') as f:
    f.write(top_part + new_css)
