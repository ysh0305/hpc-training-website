---
title: Quick Start Guide
position:: 1
---

`galyleo` is currently deployed on the following HPC systems at the San
Diego Supercomputer Center (SDSC):

- [Expanse](https://www.sdsc.edu/systems/expanse/index.html)
- [Triton Shared Compute Cluster (TSCC)](https://www.sdsc.edu/systems/tscc/index.html)

To use `galyleo`, you first need to prepend its install location to your
`PATH` environment variable. This path is different for each HPC system
at SDSC. 

On Expanse, use:

```bash
export PATH="/cm/shared/apps/sdsc/galyleo:${PATH}"
```

On TSCC, there is now a software module available to load `galyleo` into
your environment.

```bash
module load galyleo/0.7.4 
```

---

Once `galyleo` is in your `PATH`, you can use its `launch` command to
create a secure Jupyter notebook session. A number of command-line 
options will allow you to configure:

- the compute resources required to run your Jupyter notebook session;
- the type of Jupyter interface you want to use for the session and the location of the notebook working directory; and
- the software environment that contains the `jupyter` notebook server and the other software packages you want to work with during the session.

For example, as shown below, you can use the `launch` command to request
a `30`-minute JupyterLab session with `2` CPU cores and `4` GB of memory
on one of Expanse's AMD compute nodes in the `debug` partition using the 
version of JupyterLab available in its `cpu/0.17.3b` software module 
environment.

```bash
galyleo launch --account abc123 --partition debug --cpus 2 --memory 4 --time-limit 00:30:00 --env-modules cpu/0.17.3b,gcc/10.2.0,py-jupyterlab/3.2.1
```

When the `launch` command completes successfully, you will be issued a 
unique HTTPS URL for your secure Jupyter notebook session. 

```bash
https://wages-astonish-recapture.expanse-user-content.sdsc.edu?token=1abe04ac1703ca623e4e907cc37678ae
```

Copy and paste this URL into your web browser. Your Jupyter notebook
session will begin once the requested compute resources are available 
and allocated by the Slurm scheduler. 

<div id='command-line'/>
