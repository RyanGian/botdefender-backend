const express = require("express");
const app = express();
const PORT = 8080;

const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors"); // ✅ import cors

app.use(cors({ origin: "http://localhost:5173" })); // ✅ allow frontend dev server
app.use(express.json());

const serviceAccount = require("./firebaseAdminConfig.json");

// initialize firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.listen(PORT, () => console.log(`it's alive on http://localhost:${PORT}`));

app.get("/tshirt", (req, res) => {
  res.status(200).send({ tshirt: "Shirt", size: "large" });
});

app.post("/tshirt/:id", (req, res) => {
  const { id } = req.params;
  const { logo } = req.body;

  if (!logo) {
    return res.status(418).send({ message: "We need a logo!" });
  }

  res.send({ tshirt: `logo with you ${logo} and ID of ${id}` });
});

app.get("/users", async (req, res) => {
  const db = admin.firestore();

  try {
    const snapshot = await db.collection("testCollection").get();
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(data);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.post("/attack", async (req, res) => {
  const db = admin.firestore();
  const { name, country } = req.body;

  try {
    const time = new Date();
    const attack = {
      name,
      country,
      time: admin.firestore.Timestamp.fromDate(time),
    };

    // Reference to the users collection
    const usersRef = db.collection("users");
    const querySnapshot = await usersRef
      .where("name", "==", name)
      .where("country", "==", country)
      .limit(1)
      .get();

    if (!querySnapshot.empty) {
      // User exists, increment the requests count
      const userDoc = querySnapshot.docs[0];
      await userDoc.ref.update({
        requests: admin.firestore.FieldValue.increment(1),
      });
    } else {
      // User does not exist, create a new user
      await usersRef.add({
        name,
        country,
        banned: false,
        requests: 1,
      });
    }

    // Record the attack
    const docRef = await db.collection("attacks").add(attack);
    res.status(201).json({ id: docRef.id, ...attack });
  } catch (error) {
    console.error("Error handling attack:", error);
    res.status(500).send(error.message);
  }
});
