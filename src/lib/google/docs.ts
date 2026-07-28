import { gfetch, gfetchJson } from './fetcher';
import type { AuthClient } from './client';

const BASE = 'https://docs.googleapis.com/v1/documents';

/**
 * Minimal shape of documents.get's response — just enough to locate a
 * table's cells after inserting it (Docs API's insertTable request creates
 * an empty grid; text can only be filled in once the resulting cell indices
 * are known, which requires reading the document back).
 */
export interface DocStructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: unknown;
  table?: DocTable;
}

export interface DocTable {
  rows: number;
  columns: number;
  tableRows: DocTableRow[];
}

export interface DocTableRow {
  startIndex: number;
  endIndex: number;
  tableCells: DocTableCell[];
}

export interface DocTableCell {
  startIndex: number;
  endIndex: number;
  content: DocStructuralElement[];
}

export interface DocDocument {
  documentId: string;
  body: { content: DocStructuralElement[] };
}

export interface DocsClient {
  create(title: string): Promise<{ documentId: string }>;
  batchUpdate(documentId: string, requests: unknown[]): Promise<void>;
  get(documentId: string): Promise<DocDocument>;
}

export function createDocsClient(auth: AuthClient): DocsClient {
  return {
    async create(title) {
      const data = await gfetchJson<{ documentId: string }>(auth, BASE, {
        method: 'POST',
        json: { title },
      });
      return { documentId: data.documentId };
    },

    async batchUpdate(documentId, requests) {
      await gfetch(auth, `${BASE}/${documentId}:batchUpdate`, {
        method: 'POST',
        json: { requests },
      });
    },

    async get(documentId) {
      return gfetchJson<DocDocument>(auth, `${BASE}/${documentId}`);
    },
  };
}
