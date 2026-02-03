# Galyleo
### Overview
`galyleo` is a command-line shell utility to help you launch
[Jupyter](https://jupyter.org) notebooks on high-performance computing
(HPC) systems in a simple, secure way. 

It works in conjunction with the [Satellite Reverse Proxy Service](https://github.com/sdsc-hpc-training-org/satellite) and the [Slurm Workload Manager](https://slurm.schedmd.com) to provide each Jupyter notebook server you start with its own one-time, token-authenticated HTTPS connection between the compute resources of
the HPC system the notebook server is running on and your web browser.

This secure connection affords both privacy and integrity to the data
exchanged between the notebook server and your browser, helping protect
you and your work against network eavesdropping and data tampering. 

---

## Contents

- [Quick Start User Guide](quickstart)
- [Command-line options](command-line)
- [Defining your software environment](softwareenv)
  - [Conda environments](softwareenv#conda)
  - [Environment modules](softwareenv#envmodules)
  - [Singularity containers](softwareenv#singularity)
- [Debugging your session](debug)
- [Additional Information](additionalinfo)