// Shared content hash for the sync version guard: sha256 over the raw YAML
// text of a dataset. Used by the build (published per tree), the GitHub
// function and the local server, so all sides compare the same value.
import { createHash } from "node:crypto";
export const contentHash = (text) => createHash("sha256").update(text, "utf8").digest("hex");
