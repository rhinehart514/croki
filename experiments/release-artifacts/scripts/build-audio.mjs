import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "audio", "croki-score.wav");

const inputs = [
  "anoisesrc=color=brown:amplitude=0.08:duration=27:sample_rate=48000",
  "sine=frequency=55:duration=27:sample_rate=48000",
  "sine=frequency=110:duration=0.9:sample_rate=48000",
  "sine=frequency=146.83:duration=0.9:sample_rate=48000",
  "sine=frequency=196:duration=0.9:sample_rate=48000",
  "sine=frequency=261.63:duration=1.8:sample_rate=48000",
  "anoisesrc=color=white:amplitude=0.15:duration=0.7:sample_rate=48000",
  "anoisesrc=color=white:amplitude=0.15:duration=0.7:sample_rate=48000",
  "anoisesrc=color=white:amplitude=0.15:duration=0.7:sample_rate=48000",
  "anoisesrc=color=white:amplitude=0.15:duration=0.7:sample_rate=48000",
];

const filter = [
  "[0:a]highpass=f=90,lowpass=f=1200,volume=0.16,afade=t=in:d=2,afade=t=out:st=25:d=2[bed]",
  "[1:a]lowpass=f=130,volume=0.13,afade=t=in:d=1.8,afade=t=out:st=25:d=2[bass]",
  "[2:a]volume=0.22,afade=t=out:st=0.18:d=0.72,aecho=0.8:0.35:180:0.22,adelay=4850|4850[a2]",
  "[3:a]volume=0.21,afade=t=out:st=0.18:d=0.72,aecho=0.8:0.35:180:0.22,adelay=9850|9850[a3]",
  "[4:a]volume=0.21,afade=t=out:st=0.18:d=0.72,aecho=0.8:0.35:180:0.22,adelay=15850|15850[a4]",
  "[5:a]volume=0.2,afade=t=out:st=0.5:d=1.3,aecho=0.8:0.35:220:0.24,adelay=21850|21850[a5]",
  "[6:a]highpass=f=900,lowpass=f=5200,volume=0.13,afade=t=in:d=0.16,afade=t=out:st=0.16:d=0.54,adelay=4300|4300[w1]",
  "[7:a]highpass=f=900,lowpass=f=5200,volume=0.13,afade=t=in:d=0.16,afade=t=out:st=0.16:d=0.54,adelay=9300|9300[w2]",
  "[8:a]highpass=f=900,lowpass=f=5200,volume=0.13,afade=t=in:d=0.16,afade=t=out:st=0.16:d=0.54,adelay=15300|15300[w3]",
  "[9:a]highpass=f=900,lowpass=f=5200,volume=0.13,afade=t=in:d=0.16,afade=t=out:st=0.16:d=0.54,adelay=21300|21300[w4]",
  "[bed][bass][a2][a3][a4][a5][w1][w2][w3][w4]amix=inputs=10:normalize=0,highpass=f=35,lowpass=f=16000,loudnorm=I=-18:TP=-2:LRA=6[out]",
].join(";");

execFileSync(
  "ffmpeg",
  [
    "-y",
    ...inputs.flatMap((input) => ["-f", "lavfi", "-i", input]),
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-c:a",
    "pcm_s16le",
    output,
  ],
  { stdio: "ignore" },
);

process.stdout.write(`Built deterministic score at ${output}\n`);
