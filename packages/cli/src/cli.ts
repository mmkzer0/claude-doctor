#!/usr/bin/env node

import { Command } from "commander";
import {
  generateReport,
  formatReportJson,
} from "./reporter.js";
import {
  saveModel,
  loadModel,
  checkSession,
  findLatestSession,
} from "./model.js";
import {
  buildSessionTimeline,
  renderCheckOutput,
  renderAnalyzeOutput,
} from "./viz.js";
import { generateAgentsRules } from "./suggestions.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const createSpinner = () => {
  let frameIndex = 0;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let currentMessage = "";

  const render = () => {
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
    process.stderr.write(`\r${DIM}${frame} ${currentMessage}${RESET}\x1b[K`);
    frameIndex++;
  };

  return {
    start: (message: string) => {
      currentMessage = message;
      render();
      intervalId = setInterval(render, 80);
    },
    update: (message: string) => {
      currentMessage = message;
    },
    stop: () => {
      if (intervalId) clearInterval(intervalId);
      process.stderr.write("\r\x1b[K");
    },
  };
};

const program = new Command();

program
  .name("claude-doctor")
  .description(
    "Diagnose your Claude Code sessions — analyzes transcripts for behavioral anti-patterns and generates AGENTS.md rules",
  )
  .version("0.0.1")
  .option("-p, --project <path>", "Filter to a specific project path")
  .option("-s, --session <path>", "Check a specific session .jsonl file")
  .option("--all", "Analyze all sessions across all projects")
  .option("--rules", "Output AGENTS.md rules text")
  .option("--save", "Save analysis model to .claude-doctor/")
  .option("--json", "Output as JSON")
  .option(
    "-d, --dir <path>",
    "Project root for .claude-doctor/",
  )
  .action(
    async (options: {
      project?: string;
      session?: string;
      all?: boolean;
      rules?: boolean;
      save?: boolean;
      json?: boolean;
      dir?: string;
    }) => {
      if (options.all || options.rules || options.save) {
        const spinner = createSpinner();
        spinner.start("Scanning transcripts…");

        const report = await generateReport(
          options.project,
          (current, total, projectName) => {
            const shortName = projectName.replace(
              /^Users\/[^/]+\/Developer\//,
              "",
            );
            spinner.update(
              `Analyzing ${shortName} (${current}/${total})`,
            );
          },
        );

        spinner.stop();

        if (options.save) {
          const modelDir = saveModel(report, options.dir);
          console.log(
            `Model saved to ${modelDir}/ (${report.totalSessions} sessions, ${report.totalProjects} projects)`,
          );
          console.log("");
        }

        if (options.rules) {
          const rulesText = generateAgentsRules(
            report.projects,
            report.totalSessions,
          );
          if (rulesText) {
            console.log(rulesText);
          } else {
            console.log("No rules to generate — sessions look healthy.");
          }
          return;
        }

        if (options.json) {
          console.log(formatReportJson(report));
          return;
        }

        console.log(await renderAnalyzeOutput(report));
        return;
      }

      const spinner = createSpinner();
      spinner.start("Checking session…");

      let sessionFilePath: string;
      let sessionId: string;

      if (options.session) {
        sessionFilePath = options.session;
        sessionId = options.session.replace(/.*\//, "").replace(".jsonl", "");
      } else {
        const latest = findLatestSession(options.project);
        if (!latest) {
          spinner.stop();
          console.error("No sessions found.");
          process.exit(1);
        }
        sessionFilePath = latest.filePath;
        sessionId = latest.sessionId;
      }

      const savedModel = loadModel(options.dir);

      const result = await checkSession(
        sessionFilePath,
        sessionId,
        savedModel,
      );

      if (options.json) {
        spinner.stop();
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const { turns, healthPercentage, summary } =
        await buildSessionTimeline(sessionFilePath);

      spinner.stop();

      console.log(
        renderCheckOutput(
          result.sessionId,
          turns,
          healthPercentage,
          summary,
          result.activeSignals,
          result.guidance,
        ),
      );
    },
  );

program.parse();
