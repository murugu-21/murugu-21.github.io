// Shared long-form page styles: the browser defaults Tailwind's preflight
// strips, which /about and /developers both lived on (their old `.about-page a`
// / `.dev-page a` rules and the SCSS list indent of 1.25rem).
export const linkCls = "text-navy no-underline hover:underline dark:text-blue";
export const proseP = "my-[1em] leading-[1.6]";
export const proseLi = "leading-[1.6]";
export const proseUl = "my-[1em] list-disc pl-5";
export const linksUl = "links my-[1em] flex list-none flex-wrap gap-x-5 gap-y-[0.4rem] p-0";
