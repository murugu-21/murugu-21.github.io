---
title: why i chose gatsby for my blog?
date: "2021-08-15T23:46:37.121Z"
tags: ["React", "gatsby"]
description: TL;DR Static Site Generator using graphQl React stack.
---

If you are learning web development, you might have come across libraries/frameworks like React, Angular and Vue. The reason these web technologies are so popular is because they allow you to write declarative code and not worry about the implementation details. At its core, if you want a button, you only describe what happens when the button is clicked and not how it happens. This paradigm was made famous by the React library from facebook in the past decade and competing technologies have adopted a similar strategy.

This way of writing ui makes the code much more maintainable and easier to read. however, the tradeoff here is that the entire ui is rendered on the client-side, this can be incredibly slow and hurt battery use on mobile devices, and a lot of js code has to be transferred to the client(bundle sizes can reach megabites).

The web community has realised this and come out with two main solutions

1. Static Site Generation (SSG)
2. Server Side Rendering (SSR)

Out of these, if your content doesn’t change for every user and different timings, then SSG is the way to go. something like newsfeed has to use SSR. I preferred gatsby because it uses graphQl with React, one of my favourite stacks to work on for front-end projects. Also, gatsby has a lot of plugins which make it easy to add third party features and leverage out of the box solutions for common components like dark mode, google analytics, image processing etc. gatsby also had a wonderful blog template that i noticied in a lot of blogs across the internet.

https://www.gatsbyjs.com/starters/gatsbyjs/gatsby-starter-blog

The blog consistently achieves 90+ performance in lighthouse for mobile devices.
