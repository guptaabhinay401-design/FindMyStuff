const jwt = require("jsonwebtoken");


// This middleware protects routes using JWT authentication
module.exports = function(req, res, next){

    // Get token from request header
    const token = req.header("Authorization");

    // If token is not present
    if(!token || !token.startsWith("Bearer ")){
        return res.status(401).json({
            message: "No token provided, access denied ❌"
        });
    }

    try{

        // Remove "Bearer" from token string
        const actualToken = token.slice("Bearer ".length).trim();

        // Verify token using secret key
        const decoded = jwt.verify(actualToken, process.env.JWT_SECRET);

        // Store decoded user information in request
        req.user = decoded;

        // Allow request to move forward
        next();

    }

    catch(error){

        res.status(401).json({
            message: "Invalid token ❌"
        });

    }

};
