const {
  sourceAllNodes,
  createSchemaCustomization,
  compileNodeQueries,
  readOrGenerateDefaultFragments,
  buildNodeDefinitions,
  loadSchema,
  createDefaultQueryExecutor,
} = require(`gatsby-graphql-source-toolkit`)
const { print } = require(`graphql`)

async function createSourcingConfig(gatsbyApi) {
  // Step1. Setup remote schema:
  const execute = createDefaultQueryExecutor(
    `https://countries.trevorblades.com/`,
    undefined,
    { concurrency: 1 }
  )
  const schema = await loadSchema(execute)

  // Step2. Configure Gatsby node types
  const gatsbyNodeTypes = [
    {
      remoteTypeName: `Continent`,
      queries: `
        query LIST_Continent { continents { ..._ContinentId_ } }
        fragment _ContinentId_ on Continent { __typename code }
      `,
    },
    {
      remoteTypeName: `Country`,
      queries: `
        query LIST_Country { countries { ..._CountryId_ } }
        fragment _CountryId_ on Country { __typename code }
      `,
    },
    {
      remoteTypeName: `Language`,
      queries: `
        query LIST_Language { languages { ..._LanguageId_ } }
        fragment _LanguageId_ on Language { __typename code }
      `,
    },
  ]

  // Step3. Provide (or generate) fragments with fields to be fetched
  const fragments = await readOrGenerateDefaultFragments(
    `./src/api-fragments`,
    { schema, gatsbyNodeTypes }
  )

  // Step4. Compile sourcing queries
  const documents = compileNodeQueries({
    schema,
    gatsbyNodeTypes,
    customFragments: fragments,
  })

  return {
    gatsbyApi,
    schema,
    execute,
    gatsbyTypePrefix: `Example`,
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
