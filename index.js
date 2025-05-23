const express = require("express");
const app = express();
const PORT = 8080;

const admin = require("firebase-admin");
const bodyParser = require("body-parser");

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
    res.status(418).send({ message: "We need a logo!" });
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
  const { name } = req.body; // Assume you're sending name/email or any other data

  try {
    const time = new Date(); // current server time
    const attack = {
      name,
      time: admin.firestore.Timestamp.fromDate(time), // Firestore-compatible timestamp
    };

    const docRef = await db.collection("attacks").add(attack);
    res.status(201).json({ id: docRef.id, ...attack });
  } catch (error) {
    res.status(500).send(error.message);
  }
});
