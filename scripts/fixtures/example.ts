// What the fixture recorder and the tests know about examples/pulumi-basic.

// Every program sets one property to this string. It is not marked secret, so
// the tool prints it in plain text. No test result may ever hold it (0021).
export const CANARY_VALUE = "CANARY-VALUE";

// The secret config value of every stack. The tool masks it, and no test
// result may ever hold it either.
export const CANARY_SECRET = "CANARY-SECRET";

// Encrypts the secret config values in the stack files. It protects nothing:
// the example has no real secret and the passphrase is public on purpose.
export const EXAMPLE_PASSPHRASE = "sluiceway-example";

export interface ExampleProgram {
  // Directory under examples/pulumi-basic.
  dir: string;
  // The file that holds the program, relative to dir.
  source: string;
  // Stack names, as the stack files spell them.
  stacks: string[];
  stackFiles: string[];
  // Whether dependencies are installed before the first preview.
  install: boolean;
}

export const EXAMPLE_PROGRAMS: ExampleProgram[] = [
  {
    dir: "network",
    source: "Pulumi.yaml",
    stacks: ["dev", "prod"],
    stackFiles: ["Pulumi.dev.yaml", "Pulumi.prod.yaml"],
    install: false,
  },
  {
    dir: "app",
    source: "program/Main.yaml",
    stacks: ["prod"],
    stackFiles: ["Pulumi.prod.yml"],
    install: false,
  },
  {
    dir: "site",
    source: "index.ts",
    stacks: ["prod"],
    stackFiles: ["Pulumi.prod.yaml"],
    install: true,
  },
  {
    dir: "playground",
    source: "Pulumi.yaml",
    stacks: ["dev"],
    stackFiles: ["Pulumi.dev.yaml"],
    install: false,
  },
];
