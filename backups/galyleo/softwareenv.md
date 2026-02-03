---
title: Defining your software environment
position: 3
---

# Defining your software environment

After you specify the compute resources required for your Jupyter
notebook session using the *Scheduler options* outlined above, the 
next most important set of command-line options for the `launch` command
are those that help you define the software environment. 

Listed in the *Software environment options* section above, these command-line options are discussed in more detail in the next few subsections below.

<div id='conda'/>

---

## Conda environments

[Conda](https://docs.conda.io) is an open-source software package and
environment manager developed by [Anaconda Inc.](https://www.anaconda.com).
Its ease of use, compatibility across multiple operating systems, and
comprehensive support for both the Python and R software ecosystems has
made it one of the most popular ways to build and maintain custom
software environments in the data science and machine learning
communities. And because of the constantly evolving software landscape
in these spaces, which can involve quite complex software dependencies,
conda is often the simplest way to get your custom Python or R software
environment up and running on an HPC system.

`galyleo` supports the use of conda to configure the software environment 
for your Jupyter notebook sessions. In general, we recommend the use of 
[`environment.yml`](https://conda.io/projects/conda/en/latest/user-guide/tasks/manage-environments.html#creating-an-environment-from-an-environment-yml-file) 
files, which `galyleo` can use to dynamically generate and serve your 
conda environments when your session starts. For example, let's consider
the following `environment.yml` file.

```yaml
name: notebooks-sharing

channels:
  - conda-forge

dependencies:
  - python
  - jupyterlab
  - pandas
  - matplotlib
  - seaborn
  - scikit-learn
```

If you wanted to start a `30`-minute Jupyter notebook session with access
to `4` CPU cores and `8` GB of memory on one of Expanse's AMD compute nodes
in the `debug` partition using the `notebooks-sharing` conda environment,
then you would use the following `launch` command with the `--conda-yml`
command-line option followed by the path to the `environment.yml` file.

```bash
galyleo launch --account abc123 --partition debug --cpus 4 --memory 8 --time-limit 00:30:00 --conda-yml environment.yml
```

You can further improve the installation performance and reuse of these
conda environments by appending the `--mamba` and `--cache` flags to
your `launch` command, which enable the use of [mamba](https://mamba.readthedocs.io) 
to speed up software installs and saves the environment with
[conda-pack](https://conda.github.io/conda-pack) for future reuse,
respectively.

```bash
galyleo launch --account abc123 --partition debug --cpus 4 --memory 8 --time-limit 00:30:00 --conda-yml environment.yml --mamba --cache
```

Of course, if you've already installed a conda distribution --- such as
[miniconda](https://www.anaconda.com/docs/getting-started/miniconda) or 
[miniforge](https://conda-forge.org/download) --- in your `$HOME` directory
and configured a conda environment, then you can simply activate the 
environment for your Jupyter notebook session with the `--conda-env` 
option followed by the name of the environment.

```bash
galyleo launch --account abc123 --partition debug --cpus 4 --memory 8 --time-limit 00:30:00 --conda-env notebooks-sharing
```

Note, however, the `--conda-env` option assumes that your shell `rc`
file (e.g. `~/.bashrc`) has been configured by the `conda init` command
for shell interaction. If it is not configured, you can still activate a
conda environment by providing the path to the `conda.sh` initialization
script in the `etc/profile.d` directory of your distribution via the 
`--conda-init` option.

```bash
galyleo launch --account abc123 --partition debug --cpus 4 --memory 8 --time-limit 00:30:00 --conda-env notebooks-sharing --conda-init ~/miniforge3/etc/profile.d/conda.sh
```

<div id='envmodules'/>

---

## Environment modules

Most HPC systems use a software module system like [Lmod](https://lmod.readthedocs.io)
or [Environment Modules](http://modules.sourceforge.net) to provide you
with a convenient way to load pre-installed software applications,
libraries, and other packages into your environment.

If you need to `module load` any software into the environment for
your Jupyter notebook session, you can include them as a comma-separated
list to the `--env-modules` option as part of your `launch` command. 
For example, the following `launch` command requests a `30`-minute 
JupyterLab session with `2` CPU cores and `4` GB of memory on one of 
Expanse's AMD compute nodes in the `debug` partition using the version
of JupyterLab available in its `cpu/0.17.3b` software module environment.

```bash
galyleo launch --account abc123 --partition debug --cpus 2 --memory 4 --time-limit 00:30:00 --env-modules cpu/0.17.3b,gcc/10.2.0,py-jupyterlab/3.2.1
```

<div id='singularity'/>

---

## Singularity containers

[Singularity](https://sylabs.io/guides/latest/user-guide) brings 
operating system-level virtualization to scientific and high-performance
computing, allowing you to package complete software environments --- 
including operating systems, software applications, libraries, and data
--- in a simple, portable, and reproducible way, which can then be run 
almost anywhere.

If you have a container that you would like to run your Jupyter notebook
session from, you can use the `--sif` option in your `launch` command
followed by either (1) a URI to where the container is stored in a 
registry (e.g., [Docker Hub](https://hub.docker.com)), or (2) a path to
where the container image is stored on a local filesystem. In general, 
we recommend the use of containers served from [common registries](https://docs.sylabs.io/guides/latest/user-guide/singularity_and_docker.html#containers-from-other-registries),
which will be cached to your local filesystem for reuse by default 
anyway.

For example, let's say you need an [R](https://www.r-project.org)
environment for your Jupyter notebook session. Try the latest 
[r-notebook](https://quay.io/repository/jupyter/r-notebook) container
from the [Jupyter Docker Stacks](https://jupyter-docker-stacks.readthedocs.io)
project on [Quay.io](https://quay.io).

```bash
galyleo launch --account abc123 --partition debug --cpus 4 --memory 8 --time-limit 00:30:00 --sif docker://quay.io/jupyter/r-notebook:latest
```

Or, if you want to work on your latest AI project, then go ahead and 
`launch` a GPU-accelerated [PyTorch](https://pytorch.org) container from
the [NVIDIA NGC Catalog](https://catalog.ngc.nvidia.com) on a V100 GPU 
available in Expanse's `gpu-debug` partition.

```bash
galyleo launch --account abc123 --partition gpu-debug --cpus 10 --memory 92 --gpus 1 --time-limit 00:30:00 --sif docker://nvcr.io/nvidia/pytorch:24.12-py3 --bind /expanse,/scratch --nv
```

Here, the user-defined [`--bind` mount](https://docs.sylabs.io/guides/latest/user-guide/bind_paths_and_mounts.html)
option enables access to the `/expanse` filesystems (e.g., `/expanse/lustre`)
and the node-local NVMe `/scratch` disk available on each compute node
from within the container. By default, only your `$HOME` directory is
accessible from within the container. The `--nv` flag enables
[NVIDIA GPU support](https://docs.sylabs.io/guides/latest/user-guide/gpu.html). 