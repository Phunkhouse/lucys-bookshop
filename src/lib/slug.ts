export function slugify(title: string, maxLength = 60): string {
  return title
    .normalize('NFD') // split "č" into "c" + a combining mark
    .replace(/[\u0300-\u036f]/g, '') // remove the combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // anything else becomes one hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens at both ends
    .slice(0, maxLength)
    .replace(/-+$/, '') // the cut may leave a trailing hyphen
}
