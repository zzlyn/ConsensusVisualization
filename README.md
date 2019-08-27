# ConsensusVisualization

## To run

**Note**: `node_modules` is not committed to git as this contains the dependencies for this application, and is of large size.

Prerequisites:
- `npm` installed on your computer - https://nodejs.org/en/download/

1. Clone and change directory to the application directory:

    ```
    git clone https://github.com/zzlyn/ConsensusVisualization
    cd ConsensusVisualization/consensus-vis
    ```

2. Download any packages not present in this repository:

    ```
    npm install
    ```

    This will install all the necessary packages for the app, listed in `package.json`.

    **Updating packages (for future reference)**: check the latest package version number online. Update this number in `package.json` and run `npm install` again. The new version of the package will be installed.

3. Now do the usual:

    ```
    npm start
    ```

    to run the website live on your computer. Anytime you save the files in this app, the website reflects those changes.
