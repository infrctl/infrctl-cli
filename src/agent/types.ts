import { z } from "zod";

export const approvalModeSchema = z.enum(["ask", "step", "auto-edit"]);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;

export const shellPolicySchema = z.enum(["ask", "safe", "off"]);
export type ShellPolicy = z.infer<typeof shellPolicySchema>;

export const permissionProfileSchema = z.enum(["safe", "normal", "fast", "danger"]);
export type PermissionProfile = z.infer<typeof permissionProfileSchema>;

export type ApprovalRequest = {
  type: "step" | "patch" | "command" | "undo";
  message: string;
  preview?: string;
};

export type ApprovalHandler = (request: ApprovalRequest) => Promise<boolean>;

export type SmithEvent =
  | {
      type: "progress";
      message: string;
    }
  | {
      type: "plan";
      steps: string[];
    }
  | {
      type: "scan";
      cwd: string;
      files: number;
    }
  | {
      type: "git";
      phase: "before" | "after";
      isRepo: boolean;
      changedFiles: string[];
    }
  | {
      type: "memory";
      path: string;
      keyFiles: string[];
    }
  | {
      type: "compact";
      beforeMessages: number;
      afterMessages: number;
    }
  | {
      type: "read";
      path: string;
    }
  | {
      type: "search";
      query: string;
      matches: number;
    }
  | {
      type: "patch";
      summary: string;
      applied: boolean;
      files: string[];
      backupId?: string;
      preview?: string;
      dryRun?: boolean;
    }
  | {
      type: "command";
      command: string;
      exitCode: number | null;
      ran: boolean;
    }
  | {
      type: "test";
      scope: "small" | "full";
      ran: boolean;
      commands: string[];
      exitCode: number | null;
    }
  | {
      type: "undo";
      backupId: string;
      files: string[];
    }
  | {
      type: "respond";
      message: string;
    };

export type SmithEventHandler = (event: SmithEvent) => void;
