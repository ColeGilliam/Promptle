import { getUsersCollection } from '../config/db.js';

let cachedUsersCollection = null;
function getCachedUsersCollection() {
  if (!cachedUsersCollection) cachedUsersCollection = getUsersCollection();
  return cachedUsersCollection;
}

//Fetch custom profile data
export async function getProfile(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id } = req.params;

  try {
    const user = await usersCollection.findOne({ auth0Id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching profile' });
  }
}

//Update username and profile picture
export async function updateProfile(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id, username, profilePic } = req.body;

  try {
    const result = await usersCollection.updateOne(
      { auth0Id: auth0Id }, // Ensure this field name matches your MongoDB exactly
        { 
            $set: { 
            username: username, 
            profilePic: profilePic, 
            updatedAt: new Date() 
            } 
        },
      { upsert: true } // This creates the record if it doesn't exist!
    );

    console.log("Update Result:", result); // Look at your terminal for this!
    res.json({ message: 'Success' });
    } catch (err) {
    console.error('Database Error:', err);
    res.status(500).json({ error: 'Failed to save' });
    }
}