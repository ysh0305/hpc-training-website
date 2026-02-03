---
title: Command-line Options
position:: 2
---

The most commonly used command-line options for the `launch` command are
listed and described below.

Scheduler options:

- `-A, --account`: charge the compute resources required by this job to the specified account
- `-p, --partition`: select the resource partition (or queue) the job should be submitted to
- `-c, --cpus`: number of cpus to request for the job
- `-m, --memory`: amount of memory (in GB) required for the job
- `-g, --gpus`: number of GPUs required for the job
- `-t, --time-limit`: set a maximum runtime (in HH:MM:SS) for the job

Jupyter options:

- `-i, --interface`: select the user interface for the Jupyter notebook session; the only options are *lab* or *notebook* or *voila*
- `-d, --notebook-dir`: path to the working directory where the Jupyter notebook session will start; default value is your `$HOME` directory

Software environment options:

- `--conda-env`: name of a conda environment to activate
- `--conda-yml`: path to a conda `environment.yml` file
- `--mamba`: use mamba instead of miniconda
- `--cache`: cache your conda environment using conda-pack; a cached environment will be unpacked and reused if and only if the `environment.yml` file does not change

- `-e, --env-modules`: comma-separated list of environment modules to load

- `-s, --sif`: URI to a container stored in a registry, or path to a Singularity container image already stored on a local filesystem
- `-B, --bind`: comma-separated list of user-defined bind paths to be mounted within a Singularity container
- `--nv`: enable NVIDIA GPU support when running a Singularity container
