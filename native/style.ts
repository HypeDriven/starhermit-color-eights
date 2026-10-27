// The look of the menus, the table's HUD and the dialogs: the browser
// build's style sheet, rewritten class-based in tools/ui-style.css and
// converted once with `starhermit css` into assets/ui-style.json (`npm run
// css`), registered at start. The DOM kept its ember accent in every table
// theme, so the tokens are fixed; Surface detail's richer panels and primary
// button (body.ce-gfx-detailed) follow the graphics level (setDetailed).
// High contrast, larger text and reduced motion are the runtime's (it forces
// the UI's colours, scales its text and stills its motion).
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";

let css: ui.CssStyles | null = null;
let detailed = false;
export function isDetailed(): boolean { return detailed; }

function styles(): { [key: string]: ui.Style } {
  const s = css!.styles as { [key: string]: ui.Style };
  const panel = (detailed ? s[".panel-detailed"] : s[".panel"]) ?? {};
  return {
    ...s,
    label: { text: { color: "$text" } },
    paragraph: { text: { color: "$text" } },
    heading: { text: { color: "$text" } },
    widget: { focusRing: { color: "$focus", width: 3, offset: 2 } },
    checkbox: {
      text: { color: "$text", size: 17 }, minHeight: 44,
      parts: { box: { background: "#ffffff1f", border: { width: 1, color: "#ffffff55" }, radius: 4 }, mark: { background: "$accent" } },
    },
    select: { text: { color: "$text", size: 16 }, background: "#2a2330", border: { width: 1, color: "#ffffff55" }, radius: 6, minHeight: 44, padding: { start: 10, end: 10 } },
    dialog: { ...panel, parts: { backdrop: { background: "#0c0a0ecc" } } },
    scrollArea: { parts: { bar: { background: "#cfc7bd", radius: 4 } } },
  };
}

export function initStyles(): void {
  css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  ui.setTheme({
    fontSize: 17, smallSize: 14, headingSize: 28, padding: 8, spacing: 8, radius: 11,
    text: "#f4efe9", muted: "#cfc7bd", panel: "#17121c", control: "#ffffff1f", hovered: "#ffffff3a",
    pressed: "#ffffff30", field: "#2a2330", accent: "#ff7a4d", focus: "#ffcf4d", outline: "#ffffff33",
  });
  ui.setTokens(css.tokens);
  ui.setAnimations(css.animations);
  ui.setStyles(styles());
}

/** Surface detail on the graphics level: the gradient panels and primary button. */
export function setDetailed(on: boolean): void {
  if (on === detailed && css) return;
  detailed = on;
  if (css) ui.setStyles(styles());
}
