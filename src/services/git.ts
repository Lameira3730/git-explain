import { simpleGit } from "simple-git";

const git = simpleGit();

export const isGitRepository = async (): Promise<boolean> => {
  return git.checkIsRepo();
};

export const getDiff = async (files: string[] = []): Promise<string> => {
  const diff = await git.diff(["HEAD", ...pathArgs(files)]);
  return diff;
};

export const getStagedDiff = async (files: string[] = []): Promise<string> => {
  return git.diff(["--cached", ...pathArgs(files)]);
};

export const getUnstagedDiff = async (files: string[] = []): Promise<string> => {
  return git.diff(pathArgs(files));
};

export const getCommitDiff = async (
  commit: string,
  files: string[] = [],
): Promise<string> => {
  return git.show(["--format=", "--no-ext-diff", commit, ...pathArgs(files)]);
};

export const getPullDiff = async (files: string[] = []): Promise<string> => {
  return git.diff(["ORIG_HEAD..HEAD", ...pathArgs(files)]);
};

const pathArgs = (files: string[]): string[] => {
  return files.length ? ["--", ...files] : [];
};

export interface GitContext {
  branch: string;
  commit: string;
}

export const getGitContext = async (): Promise<GitContext> => {
  const [branch, commit] = await Promise.all([
    git.revparse(["--abbrev-ref", "HEAD"]),
    git.revparse(["--short", "HEAD"]),
  ]);

  return {
    branch: branch.trim(),
    commit: commit.trim(),
  };
};
