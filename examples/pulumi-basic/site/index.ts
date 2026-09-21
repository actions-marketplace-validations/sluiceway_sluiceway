import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

const config = new pulumi.Config();
const token = config.requireSecret("token");
const pages = config.requireObject<string[]>("pages");

// Several resources registered at once. Their order in the preview can change
// between two identical runs.
const slugs = pages.map(
  (page) => new random.RandomPet(`page-${page}`, { length: 2, prefix: page }),
);

const publish = new command.local.Command("publish", {
  create: "echo site published",
  environment: {
    NOTE: "CANARY-VALUE",
    TOKEN: token,
  },
});

export const pageNames = pulumi.all(slugs.map((slug) => slug.id));
export const published = publish.stdout;
