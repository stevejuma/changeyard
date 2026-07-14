import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  output: "static",
  ...(process.env.DOCS_SITE_URL ? { site: process.env.DOCS_SITE_URL } : {}),
  integrations: [
    starlight({
      title: "Changeyard Docs",
      description: "Documentation for Changeyard Kanban, VCS, CLI, and hub workflows.",
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Overview", link: "/" },
            { label: "Getting Started", link: "/getting-started/" },
          ],
        },
        {
          label: "Kanban",
          items: [
            { label: "Overview", link: "/kanban/overview/" },
            { label: "Core Workflow", link: "/kanban/core-workflow/" },
            { label: "Architecture", link: "/kanban/architecture/" },
            { label: "Remote Access", link: "/kanban/remote-access/" },
            { label: "Upstream Provenance", link: "/kanban/upstream/" },
          ],
        },
        {
          label: "VCS",
          items: [
            { label: "Overview", link: "/vcs/" },
            { label: "Core Workflow", link: "/vcs/core-workflow/" },
            { label: "Provider Model", link: "/vcs/provider-model/" },
            { label: "JJ Support", link: "/vcs/jj-supported-functionality/" },
            { label: "JJ UI Interactions", link: "/vcs/jj-ui-interactions/" },
            { label: "JJ Backend Reference", link: "/vcs/jj-backend-queries/" },
            { label: "Troubleshooting", link: "/vcs/troubleshooting/" },
          ],
        },
        {
          label: "CLI & Hub",
          items: [
            { label: "Hub", link: "/cli-hub/hub/" },
            { label: "CLI Reference", link: "/cli-hub/cli-reference/" },
            { label: "Hub Command", link: "/reference/cli-hub-command/" },
            { autogenerate: { directory: "cli" } },
          ],
        },
        {
          label: "Architecture",
          items: [
            { label: "System Architecture", link: "/architecture/" },
            { label: "Desktop", link: "/architecture/desktop/" },
            { label: "Inline Planning ADR", link: "/architecture/inline-planning/" },
          ],
        },
        {
          label: "Troubleshooting",
          items: [
            { label: "Common Issues", link: "/troubleshooting/" },
            { label: "Planning Profiles", link: "/reference/planning-profiles/" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Versioning Policy", link: "/reference/versioning-policy/" },
            { label: "Release Notes", link: "/reference/release-notes/" },
          ],
        },
      ],
    }),
  ],
});
