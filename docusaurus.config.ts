import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "hpc-training-docs",
  favicon: "img/favicon.ico",

  url: "https://hpc-training.sdsc.edu",
  baseUrl: "/hpc-training-docs/",

  onBrokenLinks: "warn",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

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
        pages: {},
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      } satisfies Preset.Options,
    ],
  ],

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
    colorMode: {
      defaultMode: "light",
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    docs: {
      sidebar: {
        autoCollapseCategories: true,
      },
    },

    navbar: {
      logo: {
        alt: "SDSC Logo",
        src: "img/sdsc_logo.png",
        height: 32,
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          label: "HPC Training Docs",
          position: "left",
        },
        {
          label: "Documentations",
          to: "/",
          position: "right",
        },
        {
          label: "Weekly Highlights",
          to: "/weekly-highlights",
          position: "right",
        },
        {
          label: "Expanse Notebooks",
          href: "https://hpc-training.sdsc.edu/Expanse-Notebooks/",
          position: "right",
        },
        {
          label: "SDSC interactive Video",
          href: "https://education.sdsc.edu/training/interactive/",
          position: "right",
        },
        {
          type: "search",
          position: "right",
        },
      ],
    },

    prism: {
      theme: prismThemes.github,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
