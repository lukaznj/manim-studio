# Interface catalogs

The supported national-language set and native names are in `../ui-languages.ts`.
It covers European sovereign states, including transcontinental countries. Regional
languages are outside this set unless they are a national language elsewhere
(Catalan, for example). Norwegian uses Bokmål, Montenegrin uses Latin script, and
Portuguese uses the Portugal variant.

English product strings are stable keys. These catalogs never translate project
names, source code, user documents, provider responses or narration. They ship with
the app and work offline. Renderer copy, native menus, notifications and developer
reports share the same catalogs.

The initial expansion used Google translation drafts, with a local MADLAD-400 3B
model for Romansh and remaining messages. Existing Croatian copy was retained.
The drafts have automatic completeness, placeholder, product-name and repetition validation;
they have not all been reviewed by native speakers. Common UI terminology is
maintained separately in `scripts/ui-copy-overrides.json`.

To maintain the catalogs:

1. Run `node scripts/extract-ui-copy.mjs` after adding or changing product copy.
2. Translate new keys in every JSON catalog. `scripts/translate-ui.py` can generate
   Google drafts **only with permission to send the English interface strings to
   that service**. It never sends project/user content. Stop on service rate limits.
   A local translation tool or manual editing can fill remaining messages.
3. Run `node scripts/apply-ui-copy-overrides.mjs` to preserve UI terminology.
4. Run `npm run check:locales` and `npm test`. `--write-index` on the check script
   refreshes the static catalog imports when adding a language.
5. Verify onboarding and Settings in the real app, in both themes, including
   a language with longer labels and a language with a different script.

Local model provenance for the initial generation: `jbochi/madlad400-3b-mt`,
Apache-2.0, `model-q4k.gguf` SHA-256
`ea6e5531a3e95213c7f0635988d119e078a655c09306e47851e15d4c0c3f9c37`.
The temporary translator and weights are not app dependencies or bundled assets.
