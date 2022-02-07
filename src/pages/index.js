import React from "react"
import { graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import AllPosts from "../components/AllPosts"


const BlogIndex = ({ data, location }) => {
  const siteTitle = data.site.siteMetadata?.title || `Title`
  
  return (
    <>
      <meta
        name="google-site-verification"
        content="L2txHVrtaGzJOqyh2MkZ4IKEVw9V1181aZ3fflwpTjk"
      />
      <Layout location={location} title={siteTitle}>
        <Seo title="All posts" />
        <AllPosts data={data} />
        <Bio />
      </Layout>
    </>
  )
}

export default BlogIndex

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
      nodes {
        excerpt
        fields {
          slug
        }
        timeToRead
        frontmatter {
          date(formatString: "MMMM DD, YYYY")
          title
          description
          tags
        }
      }
    }
  }
`
