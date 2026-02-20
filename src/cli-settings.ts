import { buildDefaultLaunchCommand } from './copilot-cli-builder';

/**
 * @deprecated Use `buildCopilotCommand()` or `buildDefaultLaunchCommand()` from
 * `copilot-cli-builder.ts` instead. Kept temporarily for call-site compatibility.
 */
export function getLaunchCommand(): string {
  return buildDefaultLaunchCommand();
}
