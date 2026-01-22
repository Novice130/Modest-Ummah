onAfterBootstrap((e) => {
    const email = "admin@modestummah.com";
    const password = "ModestAdmin2026";
    
    console.log("------------------------------------------------");
    console.log("Running Admin Reset Hook...");
    
    try {
        const admin = $app.dao().findAdminByEmail(email);
        console.log("Admin found! Updating password...");
        admin.setPassword(password);
        $app.dao().saveAdmin(admin);
        console.log("Admin password updated successfully.");
    } catch (err) {
        console.log("Admin not found. Creating new admin...");
        const admin = new Admin();
        admin.email = email;
        admin.setPassword(password);
        $app.dao().saveAdmin(admin);
        console.log("New Admin created successfully.");
    }
    console.log("------------------------------------------------");
});
