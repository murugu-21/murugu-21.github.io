import plugin from "./astro.ts";
import { tester } from "./rule-tester.ts";

const untyped = (line: number) => ({ messageId: "untyped", line });

tester.run("typed-props", plugin.rules["typed-props"], {
  valid: [
    {
      name: "an interface named Props",
      code: `interface Props { title: string }
const { title } = Astro.props;`
    },
    {
      name: "a type alias named Props, declared after the read",
      code: `const { post } = Astro.props;
type Props = InferGetStaticPropsType<typeof getStaticPaths>;`
    },
    {
      name: "Props imported from another module",
      code: `import type { Props } from "./card.ts";
const { title } = Astro.props;`
    },
    {
      name: "a component that reads no props",
      code: `const url = Astro.url;
interface Item { name: string }`
    }
  ],
  invalid: [
    {
      name: "every read of Astro.props when no Props type exists",
      code: `interface Item { name: string }
const { items } = Astro.props;
const count = Astro.props.items.length;`,
      errors: [untyped(2), untyped(3)]
    }
  ]
});
