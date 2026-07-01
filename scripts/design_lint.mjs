import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const CSS_FILE = join(SRC_DIR, "styles", "global.css");

const ALLOWED_INLINE_STYLE_FILES = new Set([
  "src/components/Icon.tsx",
  "src/components/Avatar.tsx",
  "src/components/UserBadge.tsx",
  "src/components/TopicBlock.tsx",
  "src/components/PageTransition.tsx",
  "src/components/PostCard.tsx",
  "src/pages/PostDetailPage.tsx",
  "src/pages/HomePage.tsx",
  "src/pages/BookDetailPage.tsx",
  "src/pages/ProfilePage.tsx",
  "src/pages/SettingsPage.tsx",
  "src/pages/ClubLandingPage.tsx",
  "src/components/ReadersModal.tsx",
  "src/components/ReadingPace.tsx"
]);

const REQUIRED_FOCUS_SNIPPETS = [
  "button:focus-visible",
  "a:focus-visible",
  "input:focus-visible",
  "select:focus-visible",
  "textarea:focus-visible",
  ".chip-action:focus-visible",
  ".side-nav-btn:focus-visible",
  ".user-menu-item:focus-visible",
  ".nav-pill:focus-visible",
  ".notification-trigger:focus-visible"
];

const violations = [];
const warnings = [];

const walk = (dir) => {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (st.isFile() && fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
};

const tsxFiles = walk(SRC_DIR);

for (const file of tsxFiles) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  // DL001: require explicit button type.
  const buttonRegex = /<button(?![^>]*\btype=)/gms;
  let buttonMatch = buttonRegex.exec(source);
  while (buttonMatch) {
    const before = source.slice(0, buttonMatch.index);
    const line = before.split("\n").length;
    warnings.push({
      code: "DL001",
      file: rel,
      line,
      message: "<button> sin atributo type explícito."
    });
    buttonMatch = buttonRegex.exec(source);
  }

  // DL002: inline style allowlist.
  lines.forEach((line, idx) => {
    if (!line.includes("style={")) return;
    if (!ALLOWED_INLINE_STYLE_FILES.has(rel)) {
      violations.push({
        code: "DL002",
        file: rel,
        line: idx + 1,
        message: "style inline fuera de allowlist. Usa clase/tokens compartidos."
      });
    }
  });
}

const css = readFileSync(CSS_FILE, "utf8");
for (const snippet of REQUIRED_FOCUS_SNIPPETS) {
  if (!css.includes(snippet)) {
    violations.push({
      code: "DL003",
      file: relative(ROOT, CSS_FILE).replaceAll("\\", "/"),
      line: 1,
      message: `Falta selector de foco requerido: ${snippet}`
    });
  }
}

if (warnings.length > 0) {
  console.warn("Design lint warnings:\n");
  for (const entry of warnings) {
    console.warn(`[${entry.code}] ${entry.file}:${entry.line} - ${entry.message}`);
  }
  console.warn("\nDL001 está en modo advisory hasta completar migración de botones.\n");
}

if (violations.length > 0) {
  console.error("Design lint found issues:\n");
  for (const entry of violations) {
    console.error(`[${entry.code}] ${entry.file}:${entry.line} - ${entry.message}`);
  }
  process.exit(1);
}

console.log("design:lint OK");
