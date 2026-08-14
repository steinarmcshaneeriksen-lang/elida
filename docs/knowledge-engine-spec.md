# Elida Knowledge Engine Specification

This document defines how Elida's accounting knowledge base is built,
maintained, and used. It is the canonical reference for all knowledge
engine development.

## Database Tables

- `knowledge_articles` — Main articles, one per accounting topic
- `knowledge_evaluations` — Test questions per article
- `accounting_rules` — Deterministic rules (thresholds, rates)

## TypeScript Types

- `src/lib/knowledge-base/types.ts` — Full schema matching this spec
- `src/lib/knowledge-base/index.ts` — Search and retrieval service

## Key Principles

1. Never answer from general LLM memory alone — use verified sources
2. Primary sources: Lovdata, Skatteetaten, Regjeringen.no
3. Three explanation levels: beginner, intermediate, advanced
4. Always separate: accounting treatment, VAT, tax, documentation
5. If facts are missing, ask — don't guess
6. If uncertain, say so and escalate
7. Never fabricate sources, rates, thresholds, or account numbers
8. Historical booking is a signal, not a mandate
9. Articles must be self-contained and individually retrievable
10. Deterministic calculations belong in code, not LLM output

## Disclaimers

Full: "Elida er en AI-basert økonomi- og regnskapsassistent og kan gjøre
feil. Informasjon og anbefalinger fra Elida er ment som veiledning og
erstatter ikke profesjonell regnskaps-, revisjons-, skatte- eller juridisk
rådgivning. Ved kompliserte eller vesentlige forhold bør vurderingen
kontrolleres med en statsautorisert regnskapsfører, statsautorisert revisor
eller annen relevant fagperson. Du er selv ansvarlig for bokføring,
rapportering og andre handlinger du gjennomfører i økonomisystemet ditt."

Short (chat): "Elida kan gjøre feil. Kontroller vesentlige vurderinger
før du bokfører."

## Full Specification

The complete masterprompt specification is maintained in the project and
covers 53 sections including article structure, field definitions,
quality assurance, evaluation criteria, and MVP priority topics.

See the original masterprompt for the complete specification.
