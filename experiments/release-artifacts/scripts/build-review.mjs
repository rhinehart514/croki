import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const root = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const draft = NodePath.join(root, "output", "draft-16x9.mp4");
const contactSheet = NodePath.join(root, "review", "contact-sheet.jpg");
const revisions = JSON.parse(
  NodeFS.readFileSync(NodePath.join(root, "review", "revisions.json"), "utf8"),
);
const scenes = [
  { time: 2.5, label: "Agents" },
  { time: 7.5, label: "Intent" },
  { time: 13, label: "Thread" },
  { time: 19, label: "Canvas" },
  { time: 24.5, label: "Croki" },
];

for (const [index, scene] of scenes.entries()) {
  NodeChildProcess.execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      String(scene.time),
      "-i",
      draft,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      NodePath.join(root, "review", `frame-${index + 1}.jpg`),
    ],
    { stdio: "ignore" },
  );
}

NodeChildProcess.execFileSync(
  "ffmpeg",
  [
    "-y",
    ...scenes.flatMap((_, index) => [
      "-i",
      NodePath.join(root, "review", `frame-${index + 1}.jpg`),
    ]),
    "-filter_complex",
    `hstack=inputs=${scenes.length}`,
    contactSheet,
  ],
  { stdio: "ignore" },
);

const revisionRows =
  revisions.revisions.length === 0
    ? '<p class="empty">No founder review recorded yet.</p>'
    : revisions.revisions
        .map(
          (revision) =>
            `<article><strong>${revision.id}</strong><span>${revision.status}</span><p>${revision.feedback} ${revision.decision}</p></article>`,
        )
        .join("");

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Croki launch review</title>
<style>
  :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui;background:#000;color:#f7f7f5}
  *{box-sizing:border-box}body{margin:0;background:#000}main{max-width:1440px;margin:auto;padding:42px}
  header{display:flex;align-items:end;justify-content:space-between;border-bottom:1px solid #24262a;padding-bottom:24px;margin-bottom:28px}
  h1{margin:0;font-size:38px;letter-spacing:-.05em}header p,.empty{margin:0;color:#96989e;font:13px ui-monospace,monospace}
  video{display:block;width:100%;background:#090b0f;border:1px solid #24262a}
  .portrait{width:min(100%,430px);margin:0 auto}
  .markers{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #24262a;border-top:0}
  button{appearance:none;border:0;border-right:1px solid #24262a;background:#090b0f;color:#f7f7f5;text-align:left;padding:16px;cursor:pointer}
  button:last-child{border-right:0}button span{display:block;color:#8b8d92;font:11px ui-monospace,monospace;margin-bottom:5px}
  section{margin-top:42px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.13em;margin:0 0 18px;color:#96989e}
  .pipeline{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #24262a;margin-bottom:28px}
  .pipeline div{padding:16px;border-right:1px solid #24262a}.pipeline div:last-child{border-right:0}
  .pipeline strong,.pipeline span{display:block}.pipeline strong{font:12px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}.pipeline span{margin-top:7px;color:#96989e;font-size:13px}
  .pipeline .pending strong{color:#c7f43b}
  img{display:block;width:100%;border:1px solid #24262a}article{display:grid;grid-template-columns:150px 120px 1fr;border-top:1px solid #24262a;padding:18px 0;gap:12px}article p{margin:0;line-height:1.45}
  @media(max-width:760px){main{padding:20px}header{display:block}header p{margin-top:10px}.markers,.pipeline{grid-template-columns:1fr}button,.pipeline div{border-right:0;border-bottom:1px solid #24262a}article{grid-template-columns:1fr}}
</style>
<main>
  <header><h1>Croki launch · draft review</h1><p>27 seconds · 16:9 + 9:16 · no generated voice</p></header>
  <div class="pipeline">
    <div><strong>Remotion</strong><span>Active composition</span></div>
    <div><strong>FFmpeg</strong><span>Score at -18 LUFS and review frames</span></div>
    <div><strong>Croki Preview</strong><span>Verified product evidence</span></div>
    <div class="pending"><strong>LottieLab</strong><span>Previewed, authoring export pending login</span></div>
  </div>
  <video id="draft" controls preload="metadata" src="../output/draft-16x9.mp4"></video>
  <div class="markers">${scenes.map((scene) => `<button data-time="${scene.time}"><span>${scene.time.toFixed(1)}s</span>${scene.label}</button>`).join("")}</div>
  <section><h2>Portrait adaptation</h2><video class="portrait" controls preload="metadata" src="../output/draft-9x16.mp4"></video></section>
  <section><h2>Contact sheet</h2><img src="contact-sheet.jpg" alt="Five timestamped frames from the current Croki launch draft"></section>
  <section><h2>Founder revisions</h2>${revisionRows}</section>
</main>
<script>for(const button of document.querySelectorAll('[data-time]'))button.addEventListener('click',()=>{const video=document.querySelector('#draft');video.currentTime=Number(button.dataset.time);video.play()})</script>
</html>`;

NodeFS.writeFileSync(NodePath.join(root, "review", "index.html"), html);
process.stdout.write(`Review generated at ${NodePath.join(root, "review", "index.html")}\n`);
