export const COLOR_THEME_KEY = "resumeiq-color-theme";

/** Static, application-owned script. Runs before first paint; no user input or secrets.
 * Only the root theme class differs from server HTML, not application content.
 */
export const COLOR_THEME_INIT = `(()=>{let theme;try{theme=localStorage.getItem(${JSON.stringify(COLOR_THEME_KEY)})}catch{}document.documentElement.classList.toggle('dark',theme==='dark'||(theme!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches))})()`;
