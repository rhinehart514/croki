import { Config } from "@remotion/cli/config";
import * as NodePath from "node:path";

// The launch project consumes the real product and brand assets without
// duplicating them into a video-only source of truth.
Config.setPublicDir(NodePath.resolve(process.cwd(), "../.."));
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
