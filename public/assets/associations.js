// Directed historical links, stored once on the person exercising the role.
// For enslavement: from = enslaver, to = enslaved person. Never family edges.
export function associationEntries(people) {
  return Object.entries(people).flatMap(([from, person]) =>
    Object.entries(person.associations || {}).map(([to, detail]) => ({
      id: JSON.stringify(["association", from, to]), from, to, detail,
    })));
}

export function associationsFor(people, id) {
  return associationEntries(people).filter(link => link.from === id || link.to === id)
    .map(link => ({ ...link, other: link.from === id ? link.to : link.from, outgoing: link.from === id }));
}

export function setAssociation(data, from, to, detail) {
  if (from === to || !data.people[from] || !data.people[to]) throw new Error("Invalid historical connection.");
  data.people[from].associations ||= {};
  // Editor values can be Svelte proxies; detach the JSON-shaped record before
  // storing it. structuredClone rejects a proxy even when its data is valid.
  data.people[from].associations[to] = JSON.parse(JSON.stringify(detail));
}

export function removeAssociation(data, from, to) {
  const person = data.people[from];
  if (!person?.associations) return;
  delete person.associations[to];
  if (!Object.keys(person.associations).length) delete person.associations;
}

export function associationDescription(link, id, t) {
  const role = t.get(link.from === id ? "associationEnslaver" : "associationEnslaved");
  return role + (link.detail.documented?.length ? ` · ${t.get("associationDocumented", { dates: link.detail.documented.join(", ") })}` : "");
}
