/**
 * Cross-platform path helpers for the memory subsystem.
 *
 * Shared constants such as `DEFAULT_SESSION_DIR` use a `~` prefix that does
 * not exist on Windows; {@link resolveHome} expands it via `os.homedir()`.
 *
 * Integration note: `resolveHome` is the single canonical implementation in
 * `../config/paths.js` (re-exported here so existing memory imports and tests
 * keep working). The config version accepts an optional `homeDir` override but
 * is otherwise behaviourally identical.
 */

export { resolveHome } from "../config/paths.js";
