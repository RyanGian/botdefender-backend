const express = require("express");
const app = express();
const PORT = 8080;

const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const serviceAccount = require("./firebaseAdminConfig.json");

// initialize firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.listen(PORT, () => console.log(`it's alive on http://localhost:${PORT}`));

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
      // User exists, check if they are banned
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      if (userData.banned) {
        // User is banned, return a message to the frontend
        return res
          .status(403)
          .json({ message: "You are banned and cannot make requests." });
      }

      const userRef = userDoc.ref;

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);
        if (!doc.exists) {
          throw new Error("Document does not exist!");
        }

        const currentRequests = doc.data().requests || 0;
        const newRequests = currentRequests + 1;
        const banned = newRequests > 9;

        transaction.update(userRef, {
          requests: newRequests,
          banned: banned,
        });

        // If user is banned, increment the usersBanned field in the countries collection
        if (banned) {
          const countriesRef = db.collection("countries");
          const countrySnapshot = await countriesRef
            .where("countryName", "==", country)
            .limit(1)
            .get();

          if (!countrySnapshot.empty) {
            const countryDoc = countrySnapshot.docs[0];
            transaction.update(countryDoc.ref, {
              usersBanned: admin.firestore.FieldValue.increment(1),
            });
          }
        }
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

    // Handle the countries collection
    const countriesRef = db.collection("countries");
    const countrySnapshot = await countriesRef
      .where("countryName", "==", country)
      .limit(1)
      .get();

    if (!countrySnapshot.empty) {
      const countryDoc = countrySnapshot.docs[0];
      await countryDoc.ref.update({
        requests: admin.firestore.FieldValue.increment(1),
      });
    } else {
      await countriesRef.add({
        countryName: country,
        banned: false,
        requests: 1,
        usersBanned: 0,
      });
    }

    // Record the attack
    const docRef = await db.collection("attacks").add(attack);
    await docRef.update({ id: docRef.id });

    res.status(201).json({ id: docRef.id, ...attack });
  } catch (error) {
    console.error("Error handling attack:", error);
    res.status(500).send(error.message);
  }
});

app.get("/countries/filter", async (req, res) => {
  const db = admin.firestore();
  const {
    limit = 10,
    sort = "desc",
    nameFilter = "",
    cursorRequests,
    cursorCountryName,
  } = req.query;

  try {
    let query = db.collection("countries");

    if (nameFilter) {
      // Filtering by country name using prefix match
      query = query
        .orderBy("countryName")
        .startAt(nameFilter)
        .endAt(nameFilter + "\uf8ff");
    } else {
      // Sorting by requests and country name for stable pagination
      query = query.orderBy("requests", sort).orderBy("countryName");

      // Cursor-based pagination
      if (cursorRequests !== undefined && cursorCountryName !== undefined) {
        const cursorRequestsNum = Number(cursorRequests);
        if (!isNaN(cursorRequestsNum)) {
          query = query.startAfter(cursorRequestsNum, cursorCountryName);
        }
      }
    }

    // Always apply limit
    query = query.limit(Number(limit));

    const snapshot = await query.get();

    const countries = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    let nextCursor = null;

    if (snapshot.docs.length === Number(limit)) {
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      nextCursor = {
        cursorRequests: lastDoc.get("requests"),
        cursorCountryName: lastDoc.get("countryName"),
      };
    }

    res.json({
      data: countries,
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching countries:", error);
    res.status(500).send({ error: error.message });
  }
});

app.get("/countries/filter", async (req, res) => {
  const db = admin.firestore();
  const {
    limit = 10,
    sort = "desc",
    nameFilter = "",
    cursorRequests,
    cursorCountryName,
  } = req.query;

  try {
    let query = db.collection("countries");

    if (nameFilter) {
      // Filtering by country name using prefix match
      query = query
        .orderBy("countryName")
        .startAt(nameFilter)
        .endAt(nameFilter + "\uf8ff");
    } else {
      // Sorting by requests and country name for stable pagination
      query = query.orderBy("requests", sort).orderBy("countryName");

      // Cursor-based pagination
      if (cursorRequests !== undefined && cursorCountryName !== undefined) {
        const cursorRequestsNum = Number(cursorRequests);
        if (!isNaN(cursorRequestsNum)) {
          query = query.startAfter(cursorRequestsNum, cursorCountryName);
        }
      }
    }

    // Always apply limit
    query = query.limit(Number(limit));

    const snapshot = await query.get();

    const countries = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    let nextCursor = null;

    if (snapshot.docs.length === Number(limit)) {
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      nextCursor = {
        cursorRequests: lastDoc.get("requests"),
        cursorCountryName: lastDoc.get("countryName"),
      };
    }

    res.json({
      data: countries,
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching countries:", error);
    res.status(500).send({ error: error.message });
  }
});

app.get("/countries", async (req, res) => {
  const db = admin.firestore();

  try {
    const countriesRef = db.collection("countries");

    // Fetch all documents in the countries collection
    const snapshot = await countriesRef.get();

    // Map the documents to an array of objects with countryName and usersBanned
    const result = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        [data.countryName]: data.usersBanned || 0,
      };
    });

    res.json({ data: result });
  } catch (error) {
    console.error("Error fetching countries:", error);
    res.status(500).send({ error: error.message });
  }
});

app.get("/countries/users-attacks", async (req, res) => {
  const db = admin.firestore();
  const { country } = req.query;

  try {
    let query = db.collection("attacks");

    // Filter by country
    if (country) {
      query = query.where("country", "==", country);
    }

    const snapshot = await query.get();

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const grouped = {};

    data.forEach((entry) => {
      const seconds = entry.time._seconds;
      const name = entry.name;

      const date = new Date(seconds * 1000); // Convert Firestore seconds to JS Date
      const month = date.toLocaleString("default", { month: "long" }); // e.g., March
      const year = date.getUTCFullYear();
      const label = `${month} ${year}`;

      if (!grouped[label]) {
        grouped[label] = {};
      }

      if (!grouped[label][name]) {
        grouped[label][name] = 0;
      }

      grouped[label][name]++;
    });

    // Convert to desired array format
    const result = Object.entries(grouped).map(([key, value]) => ({
      [key]: value,
    }));

    res.json({ data: result });
  } catch (error) {
    console.error("Error fetching countries:", error);
    res.status(500).send({ error: error.message });
  }
});
