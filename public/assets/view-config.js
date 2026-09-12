// Shared by the browser and build validation. Order defines the focus.
export function lineRootIds(line) {
  return line.persons !== undefined ? line.persons : [line.person];
}

export function validateExtraLines(lines, people) {
  if (lines === undefined) return [];
  if (!Array.isArray(lines)) return ["config: extraLines must be an array."];
  const errors = [];
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      errors.push("config: extraLines entry must be an object.");
      continue;
    }
    if (typeof line.label !== "string" || !line.label.trim()) {
      errors.push("config: extraLines entry without label.");
    }
    if ((line.person !== undefined) === (line.persons !== undefined)) {
      errors.push(`config: extraLines '${line.label}' must specify exactly one of person or persons.`);
      continue;
    }
    const roots = lineRootIds(line);
    if (!Array.isArray(roots) || !roots.length || roots.some(id => typeof id !== "string" || !id.trim())) {
      errors.push(`config: extraLines '${line.label}' requires a non-empty list of person IDs.`);
      continue;
    }
    if (new Set(roots).size !== roots.length) {
      errors.push(`config: extraLines '${line.label}' contains duplicate person IDs.`);
    }
    for (const id of roots) {
      if (!Object.hasOwn(people, id)) errors.push(`config: extraLines '${line.label}' references unknown person '${id}'.`);
    }
  }
  return errors;
}

// Instance defaults apply only to the configured default dataset.
export function defaultRootIds(config, activeTree, focusId) {
  return activeTree === config.defaultTree && config.overview?.defaultPersons !== undefined
    ? config.overview.defaultPersons : [focusId];
}

export function validateDefaultPersons(overview, people) {
  if (overview?.defaultPersons === undefined) return [];
  return validateExtraLines([{ label: "defaultPersons", persons: overview.defaultPersons }], people);
}
