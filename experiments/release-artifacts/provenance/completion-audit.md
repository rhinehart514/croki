# Completion audit

This audit tracks the requested end state against authoritative repository and runtime evidence. A passing draft is not equivalent to a completed release.

| Requirement                                    | Current evidence                                                                                                                                       | Status                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Optional repository-owned package              | `experiments/release-artifacts/`; no Croki application source changed                                                                                  | Proven                                                           |
| One durable Thread and isolated worktree       | Croki Thread capture; worktree branch `codex/release-artifacts` based on `cb549169ea687ce1dc3b3c522a2ef0d08b4da3ea`                                    | Proven                                                           |
| Canvas remains domain-agnostic                 | Captured Canvas contains product intent, decisions, evidence, consequences, and relationships only                                                     | Proven                                                           |
| Provider-native workflow                       | `.agents/skills/release-artifacts/SKILL.md` plus checked-in `t3.json` actions                                                                          | Proven                                                           |
| Deterministic real product evidence            | Two reviewed Preview recordings and one derived still; SHA-256 digests in `public/captures/manifest.json`                                              | Proven                                                           |
| Code-native composition                        | Typed Remotion compositions, shared components, frame-driven motion, first-party `@remotion/lottie` rendering, and pinned self-hosted Inter typography | Proven                                                           |
| Media processing without an NLE                | Checked-in FFmpeg audio, frame extraction, review, and probing scripts                                                                                 | Proven                                                           |
| No generated voice                             | Provenance declares `voice: none`; both drafts contain only the deterministic score normalized to a -18 LUFS target                                    | Proven                                                           |
| 20 to 30 seconds                               | Both candidate renders probe at 27.050667 seconds                                                                                                      | Proven                                                           |
| Founder review and revision                    | Reviews 1 and 2 addressed; review 3 produced the legibility-led rebuild                                                                                | Partially proven: current cut still requires founder judgment    |
| Playable browser review                        | Range-capable local server; Croki Preview loaded both videos at `readyState 4` and advanced both during playback                                       | Proven                                                           |
| 16:9 and 9:16 adaptation                       | `draft-16x9.mp4` is 1920×1080; `draft-9x16.mp4` is 1080×1920; both share one composition system                                                        | Candidate proven; final export pending                           |
| LottieLab authoring handoff                    | Official LottieLab preview accepted the seed and SVG; Remotion rendered the seed                                                                       | Incomplete: authenticated edit and JSON export not yet performed |
| Revision safety                                | One Croki worktree, native per-turn checkpoints and diffs, versioned scene source, capture hashes, and founder decisions                               | Proven                                                           |
| Setup, operation, provenance, licensing, reuse | `README.md`, `LICENSING.md`, brief, manifests, skill, and this audit                                                                                   | Proven                                                           |
| Final validation                               | Validator currently rejects missing output provenance, open founder review, rejected creative status, and incomplete LottieLab export                  | Correctly failing                                                |

## Remaining proof

1. Complete the authenticated LottieLab edit/export round trip and render the checked-in export, not the provisional seed.
2. Obtain founder judgment on both current candidate ratios and address any resulting revision.
3. Mark the accepted review and creative status only after that judgment.
4. Run the gated final render, which records output hashes and media metadata.
5. Run `validate` and inspect representative frames from both final files.

The workflow is not complete while any item above remains unresolved.
