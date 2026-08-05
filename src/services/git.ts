import { simpleGit } from "simple-git";

const git = simpleGit();

export const isGitRepository = async (): Promise<boolean> => {
  return git.checkIsRepo();
};

export const getDiff = async (files: string[] = []): Promise<string> => {
  const diff = await git.diff(["HEAD", ...files]);
  return diff;
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
