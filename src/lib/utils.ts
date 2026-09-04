// shadcn's `cn` engine: a drop-in replacement for clsx + tailwind-merge that
// ships the same conditional-join + Tailwind conflict resolution in one
// zero-dependency package. Re-exported here so the vendored ui/ components
// keep their single import point.
export {cn, type ClassValue} from "cn";
