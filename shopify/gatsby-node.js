const {
  sourceAllNodes,
  createSchemaCustomization,
  generateDefaultFragments,
  compileNodeQueries,
  readOrGenerateDefaultFragments,
  writeCompiledQueries,
  buildNodeDefinitions,
  loadSchema,
  createDefaultQueryExecutor,
} = require(`gatsby-graphql-source-toolkit`)

async function createSourcingConfig(gatsbyApi) {
  // Step1. Set up remote schema:
  const defaultExecute = createDefaultQueryExecutor(
    `https://${process.env.SHOPIFY_STORE_URL}/api/2019-07/graphql`,
    {
      headers: {
        "X-Shopify-Storefront-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
        // Shopify requires "Accept" header:
        "Accept": "application/json",
      },
    },
    { concurrency: 1 }
  )

  const execute = args => {
    console.log(args.operationName, args.variables)
    return defaultExecute(args)
  }

  const schema = await loadSchema(execute)

  // Step2. Configure Gatsby node types
  const gatsbyNodeTypes = [
    {
      remoteTypeName: `Product`,
      queries: `
        query LIST_PRODUCTS {
          products(first: $first, after: $after) {
            edges {
              node { ..._ProductId_ }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }
        fragment _ProductId_ on Product {
          __typename
          id
        }
      `,
    },
    {
      remoteTypeName: `Collection`,
      queries: `
        query LIST_COLLECTIONS {
          collections(first: $first, after: $after) {
            edges {
              node { ..._CollectionId_ }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }
        fragment _CollectionId_ on Collection {
          __typename
          id
        }
      `,
    },
    {
      remoteTypeName: `Blog`,
      queries: `
        query LIST_BLOGS {
          blogs(first: $first, after: $after) {
            edges {
              node { ..._BlogId_ }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }
        fragment _BlogId_ on Blog {
          __typename
          id
        }
      `,
    },
    {
      remoteTypeName: `Article`,
      queries: `
        query LIST_ARTICLES {
          articles(first: $first, after: $after) {
            edges {
              node { ..._ArticleId_ }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }
        fragment _ArticleId_ on Article {
          __typename
          id
        }
      `,
    },
    {
      remoteTypeName: `Page`,
      queries: `
        query LIST_PAGES {
          pages(first: $first, after: $after) {
            edges {
              node { ..._PageId_ }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }
        fragment _PageId_ on Page {
          __typename
          id
        }
      `,
    },
  ]

  // Shopify has nullable fields for `first` and `last` on connections
  //   but requires at least one of those to be provided, otherwise it fails
  //   with runtime error. So provide the first 10 connected items for now.
  const provideConnectionArgs = (field, parentType) => {
    if (field.args.some(arg => arg.name === `first`)) {
      return { first: 10 }
    }
  }

  // Step3. Provide (or generate) fragments with fields to be fetched
  const fragments = await readOrGenerateDefaultFragments(
    `./shopify-fragments`,
    {
      schema,
      gatsbyNodeTypes,
      defaultArgumentValues: [provideConnectionArgs],
    }
  )

  // Step4. Compile sourcing queries
  const documents = compileNodeQueries({
    schema,
    gatsbyNodeTypes,
    customFragments: fragments,
  })
  await writeCompiledQueries(`./sourcing-queries`, documents)
  return {
    gatsbyApi,
    schema,
    execute,
    gatsbyTypePrefix: `Shopify`,
    gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes, documents }),
  }
}

exports.sourceNodes = async (gatsbyApi, pluginOptions) => {
  const config = await createSourcingConfig(gatsbyApi)

  // Step5. Add explicit types to gatsby schema
  await createSchemaCustomization(config)

  // Step6. Source nodes
  await sourceAllNodes(config)
}
