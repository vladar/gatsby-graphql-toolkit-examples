const fs = require(`fs-extra`)
const {
  sourceAllNodes,
  createSchemaCustomization,
  compileNodeQueries,
  readOrGenerateDefaultFragments,
  buildNodeDefinitions,
  loadSchema,
  createDefaultQueryExecutor,
} = require("gatsby-graphql-source-toolkit")

const CHUNK_SIZE = 100
const nacelleSpaceId = process.env.NACELLE_SPACE_ID
const nacelleSpaceToken = process.env.NACELLE_SPACE_TOKEN
const fragmentsDir = process.cwd() + `/nacelle_fragments`

const PaginateNacelle = {
  name: "NacellePagination",
  expectedVariableNames: [`first`, `after`],
  start() {
    return {
      variables: { first: CHUNK_SIZE, after: undefined },
      hasNextPage: true,
    }
  },
  next(state, page) {
    return {
      variables: { first: CHUNK_SIZE, after: page.nextToken },
      hasNextPage: Boolean(page.nextToken && page.items.length === CHUNK_SIZE),
    }
  },
  concat(acc, page) {
    return {
      ...acc,
      items: {
        ...acc.items,
        ...page.items,
      },
      nextToken: page.nextToken,
    }
  },
  getItems(pageOrResult) {
    return pageOrResult.items
  },
}

async function createSourcingConfig(gatsbyApi) {
  // Set up remote schema:
  const defaultExecute = createDefaultQueryExecutor(
    "https://hailfrequency.com/v2/graphql",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-nacelle-space-id": nacelleSpaceId,
        "x-nacelle-space-token": nacelleSpaceToken,
      },
    }
  )
  const execute = args => {
    console.log(args.operationName, args.variables)
    return defaultExecute(args)
  }
  const schema = await loadSchema(execute)

  // Configure Gatsby node types
  // Note:
  //  Queries with LIST_ prefix are automatically executed in sourceAllNodes
  //  Queries with NODE_ prefix are executed in sourceNodeChanges for updated nodes
  const gatsbyNodeTypes = [
    {
      remoteTypeName: `Product`,
      queries: `
        query LIST_PRODUCTS {
          getProducts(first: $first, after: $after) {
            nextToken
            items { ..._ProductId_ }
          }
        }
        query NODE_PRODUCT {
          getProductByHandle(handle: $handle, locale: $locale) {
            ..._ProductId_
          }
        }
        fragment _ProductId_ on Product { __typename handle locale }
      `,
    },
    {
      remoteTypeName: `Collection`,
      queries: `
        query LIST_COLLECTION {
          getCollections(first: $first, after: $after) {
            nextToken
            items { ..._CollectionId_ }
          }
        }
        query NODE_COLLECTION {
          getCollectionByHandle(handle: $handle, locale: $locale) {
            ..._CollectionId_
          }
        }
        fragment _CollectionId_ on Collection { __typename handle locale }
      `
    },
    {
      remoteTypeName: `Content`,
      queries: `
        query LIST_CONTENT {
          getContent(first: $first, after: $after) {
            nextToken
            items { ..._ContentId_ }
          }
        }
        query NODE_CONTENT {
          getContentByHandle(
            type: $type
            handle: $handle
            locale: $locale
          ) {
            ..._ContentId_
          }
        }
        fragment _ContentId_ on Content {
          __typename
          type
          handle
          locale
        }
      `
    },
  ]

  // Provide (or generate) fragments with fields to be fetched
  fs.ensureDir(fragmentsDir)
  const fragments = await readOrGenerateDefaultFragments(fragmentsDir, {
    schema,
    gatsbyNodeTypes,
  })

  // Compile sourcing queries
  const documents = compileNodeQueries({
    schema,
    gatsbyNodeTypes,
    customFragments: fragments,
  })

  return {
    gatsbyApi,
    schema,
    execute,
    gatsbyTypePrefix: `nacelle`,
    gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes, documents }),
    paginationAdapters: [PaginateNacelle],
  }
}

exports.sourceNodes = async (gatsbyApi, pluginOptions) => {
  const config = await createSourcingConfig(gatsbyApi)

  // Add explicit types to gatsby schema
  await createSchemaCustomization(config)

  // Source nodes
  await sourceAllNodes(config)
}
