# Creating react apps

1. Install NPM

2. Install create-react-app using (command line):

    ```
    npm install -g create-react-app
    ```

3. Go to the desired directory (command line), and type the following:

    ```
    create-react-app "insert-your-app-name-here"
    ```

    **NOTE**: If you use capital letters in your app name it gives error.

4. Done. Everything is setup! Now type:

    ```
    npm start
    ```

    to start a live server on your laptop for the website.

5. When you save any changes you make in the files the website automatically reflects the changes.

The `index.js`, `index.css`, `App.js` and `App.css` files will be available in `src` folder inside your app's directory. To understand the basic flow the programme starts running from the `index.js` file. In this file it calls the `App` file. The `App` file is where JSX syntax is used.