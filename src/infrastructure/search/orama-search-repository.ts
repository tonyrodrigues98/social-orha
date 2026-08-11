import { create, insertMultiple, search } from "@orama/orama";

export interface SearchDocument {
  id: string;
  title: string;
  body: string;
  tags: string[];
}

export async function createOramaSearchRepository(initialDocuments: SearchDocument[] = []) {
  const database = await create({
    schema: {
      id: "string",
      title: "string",
      body: "string",
      tags: "string[]",
    } as const,
  });

  if (initialDocuments.length > 0) {
    await insertMultiple(database, initialDocuments);
  }

  return {
    async search(term: string) {
      const result = await search(database, { term, properties: ["title", "body", "tags"] });
      return result.hits.map((hit) => hit.document as SearchDocument);
    },
  };
}
