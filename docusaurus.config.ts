import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "hpc-training-docs",
  favicon: "img/favicon.ico",

  url: "https://YOUR_DOMAIN.com",
  baseUrl: "/hpc-training-docs/",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
        },
        blog: false,
        pages: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  /** 🔍 Local Search Plugin */
  themes: [
    [
      require.resolve("@cmfcmf/docusaurus-search-local"),
      {
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        language: "en",
      },
    ],
  ],

  themeConfig: {
    navbar: {
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          label: "HPC Training Docs",
          position: "left",
        },
        {
          type: "search",
          position: "right",
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
