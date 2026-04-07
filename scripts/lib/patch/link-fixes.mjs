import path from "path";

export function fixFileSpecificLinks(text, sourcePath, deps) {
  const { SRC, getRepoMetaForSourcePath } = deps;
  const src = (sourcePath || "").replace(/\\/g, "/");
  const repoMeta = getRepoMetaForSourcePath(sourcePath);

  function toRepoBlobUrl(relPathFromRepoRoot) {
    if (!repoMeta?.repoUrl) return "";
    const branch = repoMeta.branch || "main";
    const rel = String(relPathFromRepoRoot || "").replace(/\\/g, "/").replace(/^\/+/, "");
    return `${repoMeta.repoUrl}/blob/${branch}/${rel}`;
  }

  function toRepoTreeUrl(relPathFromRepoRoot) {
    if (!repoMeta?.repoUrl) return "";
    const branch = repoMeta.branch || "main";
    const rel = String(relPathFromRepoRoot || "").replace(/\\/g, "/").replace(/^\/+/, "");
    return `${repoMeta.repoUrl}/tree/${branch}/${rel}`;
  }

  function rewriteToSiblingDocs(input, slugs) {
    let out = input;
    for (const slug of slugs) {
      const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\]\\(#${escaped}\\)`, "gi"), `](./${slug})`);
      out = out.replace(new RegExp(`\\]\\(${escaped}\\)`, "gi"), `](./${slug})`);
    }
    return out;
  }

  if (src.endsWith("/basic_skills/basic_linux_skills_expanse/basic_linux_skills_expanse.md")) {
    text = rewriteToSiblingDocs(text, [
      "basic-environment",
      "directories-navigation",
      "copying-directories",
      "manipulating-files",
      "permissions",
      "wildcards-utilities",
    ]);
  }

  if (src.endsWith("/basic_skills/interactive_computing/interactive_computing.md")) {
    text = rewriteToSiblingDocs(text, [
      "interactive-nodes",
      "interactive-node-command-line",
      "interactive-gpu-command-line",
    ]);
  }

  if (src.endsWith("/basic_skills/using_github/using_github.md")) {
    text = rewriteToSiblingDocs(text, [
      "create-github-account",
      "install-git",
      "using-git-at-sdsc",
    ]);
  }

  if (src.endsWith("/basic_skills/basic_linux_skills_expanse/directories-navigation.md")) {
    text = text.replace(/\]\(#permissions\)/gi, "](./permissions)");
  }

  if (/\/(1_)?dask_tutorial\/README\.md$/i.test(src)) {
    const repoRoot = path.join(SRC, repoMeta?.repoName || "");
    const daskDir = path.dirname(sourcePath || "");
    const relDir = path.relative(repoRoot, daskDir).replace(/\\/g, "/");
    const overviewUrl = toRepoBlobUrl(`${relDir}/00_overview.ipynb`);
    const mlUrl = toRepoBlobUrl(`${relDir}/08_machine_learning.ipynb`);
    if (overviewUrl) {
      text = text.replace(/\]\(00_overview\.ipynb\)/gi, `](${overviewUrl})`);
    }
    if (mlUrl) {
      text = text.replace(/\]\(08_machine_learning\.ipynb\)/gi, `](${mlUrl})`);
    }
  }

  if (/\/(2\.5_interactive_computing)\/README\.md$/i.test(src)) {
    const repoRoot = path.join(SRC, repoMeta?.repoName || "");
    const relDir = path.relative(repoRoot, path.dirname(sourcePath || "")).replace(/\\/g, "/");
    const summaryUrl = toRepoTreeUrl(`${relDir}/summary`);
    const docsUrl = toRepoTreeUrl(`${relDir}/docs`);
    if (summaryUrl) {
      text = text.replace(/\]\(summary\)/gi, `](${summaryUrl})`);
    }
    if (docsUrl) {
      text = text.replace(/\]\(docs\)/gi, `](${docsUrl})`);
    }
  }

  if (/\/(?:5\.2a_gpu_computing_and_programming|5\.3a_gpu_computing_programming|5\.3_gpu_computing_and_programming)\/README\.md$/i.test(src)) {
    text = text.replace(/\]\(cuda-samples\)/gi, "](https://github.com/NVIDIA/cuda-samples)");
  }

  if (src.endsWith("/sdsc-summer-institute-2022/5.2a_gpu_computing_and_programming/nvidia-cuda-samples/README.md")) {
    text = text
      .replace(/\]\(#windows-1\)/gi, "](#windows)")
      .replace(/\]\(\.\/Samples\/0_Introduction\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/0_Introduction)")
      .replace(/\]\(\.\/Samples\/2_Concepts_and_Techniques\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/2_Concepts_and_Techniques)")
      .replace(/\]\(\.\/Samples\/3_CUDA_Features\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/3_CUDA_Features)")
      .replace(/\]\(\.\/Samples\/4_CUDA_Libraries\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/4_CUDA_Libraries)")
      .replace(/\]\(\.\/Samples\/5_Domain_Specific\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/5_Domain_Specific)")
      .replace(/\]\(\.\/Samples\/6_Performance\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/6_Performance)");
  }

  if (src.endsWith("/sdsc-summer-institute-2022/5.2a_gpu_computing_and_programming/nvidia-cuda-samples/CHANGELOG.md")) {
    text = text.replace(/\]\(\.\/README\.md#windows-1\)/gi, "](./README.md#windows)");
  }

  if (src.endsWith("/sdsc-summer-institute-2022/5.2a_gpu_computing_and_programming/nvidia-cuda-samples/Samples/1_Utilities/README.md")) {
    text = text.replace(/\]\(\.\/deviceQueryDrv\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/1_Utilities/deviceQueryDrv)");
  }

  if (src.endsWith("/sdsc-summer-institute-2023/3.2_data_management/tutorials/TRANSFER.md")) {
    text = text
      .replace(/\]\(expanse-storage-external-networks\.png\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/expanse-storage-external-networks.png)")
      .replace(/\]\(xsede_access_point_map\.jpg\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/xsede_access_point_map.jpg)")
      .replace(/\]\(globus-homepage\.png\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/globus-homepage.png)")
      .replace(/\]\(globus-connect-personal\.png\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/globus-connect-personal.png)")
      .replace(/\]\(globus-web-app-climate-seg-data-transfer-complete\.png\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/globus-web-app-climate-seg-data-transfer-complete.png)");
  }

  if (src.endsWith("/sdsc-summer-institute-2024/3.5_high_throughput_computing/DHTC.md")) {
    text = text.replace(
      /\]\(osg_logo\.png\)/gi,
      "](../../sdsc-summer-institute-2023/3.5_high_throughput_computing/osg_logo.png)"
    );
  }

  if (src.endsWith("/ciml-summer-institute-2021/4.2_spark_hands_on/README.md")) {
    text = text
      .replace(/^(\s*export PATH=.*)$/m, "```bash\n$1")
      .replace(/^(\s*galyleo\.sh launch.*)$/m, "$1\n```");
  }

  if (src.endsWith("/ciml-summer-institute-2021/4.5_deep_learning_transfer_learning_hands_on/README.md")) {
    text = text
      .replace(/^(\s*export PATH=.*)$/m, "```bash\n$1")
      .replace(/^(\s*galyleo\.sh launch.*)$/m, "$1\n```");
  }

  if (src.endsWith("/ciml-summer-institute-2021/4.4_deep_learning_hands_on/README.md")) {
    text = text.replace(/<<<<<<\s*-------/g, "&lt;&lt;&lt;&lt;&lt;&lt; -------");
  }

  if (src.endsWith("/ciml-summer-institute-2021/README.md")) {
    text = text
      .replace(/\]\(#(?:thomas|kandes|rose|sivagnanam|sinkovit|goetz|shantharam|nguyen|rodriguez)\)/gi, "](#instructors)")
      .replace(/\[\(bio\)\]\(TBD\)/g, "bio (TBD)");
  }

  if (src.endsWith("/ciml-summer-institute-2021/0_preparation/README.md")) {
    text = text.replace(/\[presenter\]\(#tbd\)/gi, "presenter");
  }

  if (src.endsWith("/ciml-summer-institute-2024/README.md")) {
    text = text.replace(/\{##/g, "{#");
  }

  if (src.endsWith("/expanse-101/expanse-101/compiling-linking.md")) {
    text = text.replace(/\]\(#run-jobs\)/gi, "](./running-jobs)");
  }

  if (src.endsWith("/expanse-101/expanse-101/running-jobs.md")) {
    text = text
      .replace(/^#### Slurm Partitions\s*$/m, "#### Slurm Partitions {#run-jobs-slurm-partition}")
      .replace(/^#### Common Slurm Commands\s*$/m, "#### Common Slurm Commands {#run-jobs-slurm-commands}")
      .replace(/^#### Slurm Job\s+State Codes\s*$/m, "#### Slurm Job State Codes {#run-jobs-slurm-status}");
  }

  if (src.endsWith("/expanse-101/expanse-101/cpu-jobs.md")) {
    text = text
      .replace(/^#### Hello World \(MPI\): Source Code\s*$/m, "#### Hello World (MPI): Source Code {#hello-world-mpi-source}")
      .replace(/^#### Hello World \(MPI\): Compiling\s*$/m, "#### Hello World (MPI): Compiling {#hello-world-mpi-compile}")
      .replace(/^#### Hello World \(MPI\): Batch Script Submission\s*$/m, "#### Hello World (MPI): Batch Script Submission {#hello-world-mpi-batch-submit}")
      .replace(/^#### Hello World \(MPI\): Batch Script Output\s*$/m, "#### Hello World (MPI): Batch Script Output {#hello-world-mpi-batch-output}")
      .replace(/^#### Hello World \(MPI\): Interactive Jobs\s*$/m, "#### Hello World (MPI): Interactive Jobs {#hello-world-mpi-interactive}")
      .replace(/^#### Hello World \(OpenMP\): Source Code\s*$/m, "#### Hello World (OpenMP): Source Code {#hello-world-omp-source}")
      .replace(/^#### Hello World \(OpenMP\): Compiling\s*$/m, "#### Hello World (OpenMP): Compiling {#hello-world-omp-compile}")
      .replace(/^#### Hello World \(OpenMP\): Batch Script Submission\s*$/m, "#### Hello World (OpenMP): Batch Script Submission {#hello-world-omp-batch-submit}")
      .replace(/^#### Hello World \(OpenMP\): Batch Script Output\s*$/m, "#### Hello World (OpenMP): Batch Script Output {#hello-world-omp-batch-output}")
      .replace(/^#### Hello World Hybrid \(MPI \+ OpenMP\): Source Code\s*$/m, "#### Hello World Hybrid (MPI + OpenMP): Source Code {#hybrid-mpi-omp-source}")
      .replace(/^#### Hello World Hybrid \(MPI \+ OpenMP\): Compiling\s*$/m, "#### Hello World Hybrid (MPI + OpenMP): Compiling {#hybrid-mpi-omp-compile}")
      .replace(/^#### Hello World Hybrid \(MPI \+ OpenMP\): Batch Script Submission\s*$/m, "#### Hello World Hybrid (MPI + OpenMP): Batch Script Submission {#hybrid-mpi-omp-batch-submit}")
      .replace(/^#### Hello World Hybrid \(MPI \+ OpenMP\): Batch Script Output\s*$/m, "#### Hello World Hybrid (MPI + OpenMP): Batch Script Output {#hybrid-mpi-omp-batch-output}");
  }

  if (src.endsWith("/expanse-101/expanse-101/gpu-jobs.md")) {
    text = text
      .replace(/^#### Hello World \(GPU-CUDA\): Source Code\s*$/m, "#### Hello World (GPU-CUDA): Source Code {#hello-world-cuda-source}")
      .replace(/^#### Hello World \(GPU-CUDA\): Compiling\s*$/m, "#### Hello World (GPU-CUDA): Compiling {#hello-world-cuda-compile}")
      .replace(/^#### Hello World \(GPU-CUDA\): Execute\s*$/m, "#### Hello World (GPU-CUDA): Execute {#hello-world-execute}")
      .replace(/^#### Hello World \(GPU-CUDA\): Batch Script Submission\s*$/m, "#### Hello World (GPU-CUDA): Batch Script Submission {#hello-world-cuda-batch-submit}")
      .replace(/^#### Hello World \(GPU-CUDA\): Batch Script Output\s*$/m, "#### Hello World (GPU-CUDA): Batch Script Output {#hello-world-cuda-batch-output}")
      .replace(/^#### Vector Addition \(GPU-CUDA\): Source Code\s*$/m, "#### Vector Addition (GPU-CUDA): Source Code {#vec-add-cuda-source}")
      .replace(/^#### Vector Addition \(GPU-CUDA\): Compiling & Running\s*$/m, "#### Vector Addition (GPU-CUDA): Compiling & Running {#vec-add-cuda-compile}")
      .replace(/^#### Vector Addition \(GPU-CUDA\): Batch Script Submission\s*$/m, "#### Vector Addition (GPU-CUDA): Batch Script Submission {#vec-add-cuda-batch-submit}")
      .replace(/^#### Vector Addition \(GPU-CUDA\): Batch Script Output\s*$/m, "#### Vector Addition (GPU-CUDA): Batch Script Output {#vec-add-cuda-batch-output}")
      .replace(/^#### Laplace2D \(GPU\/OpenACC\): Source Code\s*$/m, "#### Laplace2D (GPU/OpenACC): Source Code {#laplace2d-gpu-source}")
      .replace(/^#### Laplace2D \(GPU\/OpenACC\): Compiling\s*$/m, "#### Laplace2D (GPU/OpenACC): Compiling {#laplace2d-gpu-compile}")
      .replace(/^#### Laplace2D \(GPU\/OpenACC\): Batch Script Submission\s*$/m, "#### Laplace2D (GPU/OpenACC): Batch Script Submission {#laplace2d-gpu-batch-submit}")
      .replace(/^#### Laplace2D \(GPU\/OpenACC\): Batch Script Output\s*$/m, "#### Laplace2D (GPU/OpenACC): Batch Script Output {#laplace2d-gpu-batch-output}");
  }

  if (/\/hpc-security\/connecting-to-hpc-systems\/connect-to-(?:comet|expanse)\.md$/i.test(src)) {
    text = text.replace(/\]\(#term-windows-10\)/gi, "](#term-windows10)");
  }

  return text;
}
