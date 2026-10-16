import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from "astro";
import { posts } from "virtual:content/posts";

import { markdownResponse } from "#src/lib/responses.ts";

export const getStaticPaths = (() =>
  posts.map(({ slug, markdown }) => ({
    params: { slug },
    props: { markdown }
  }))) satisfies GetStaticPaths;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET = (({ props }: { props: Props }) =>
  markdownResponse(props.markdown)) satisfies APIRoute<Props>;
