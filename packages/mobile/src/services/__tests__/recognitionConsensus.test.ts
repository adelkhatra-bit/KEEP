import { updateRecognitionConsensus } from '../recognitionConsensus';

const candidate = { confidence: 0.37, title: 'I still see your smile', artist: 'RKO prods', providerIds: {}, availableOn: [] } as any;

describe('recognitionConsensus', () => {
  it('refuse un seul match faible', () => {
    const one = updateRecognitionConsensus(null, candidate, 37, 1000);
    expect(one.accepted).toBeNull();
  });

  it('accepte le même candidat répété sur deux fenêtres', () => {
    const one = updateRecognitionConsensus(null, candidate, 37, 1000);
    const two = updateRecognitionConsensus(one.state, candidate, 25, 8000);
    expect(two.accepted?.title).toBe(candidate.title);
  });

  it('ne mélange pas deux morceaux différents', () => {
    const one = updateRecognitionConsensus(null, candidate, 37, 1000);
    const two = updateRecognitionConsensus(one.state, { ...candidate, title: 'Autre morceau' }, 46, 8000);
    expect(two.accepted).toBeNull();
    expect(two.state?.hits).toBe(1);
  });
});

describe("ACRCloud server fallback contract", () => {
  const fs = require('fs');
  const path = require('path');
  const server = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-music-fallback', 'index.ts'), 'utf8');

  it('promotes a noisy 40+ match only with exact public-catalog corroboration', () => {
    expect(server).toContain('const MIN_CATALOG_CORROBORATED_SCORE = 40');
    expect(server).toContain('exactCatalogMatch: Boolean(exactItunes || exactDeezer)');
    expect(server).toContain('recognitionEvidence: "catalog_exact"');
  });

  it('keeps the 55 immediate threshold and repeated consensus fallback', () => {
    expect(server).toContain('const MIN_ACR_SCORE = 55');
    expect(server).toContain('candidateRecognition');
    expect(server).toContain('"repeat_required"');
  });
});
