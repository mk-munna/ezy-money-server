const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yfvcqxe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect();

        const UserCollection = client.db('EzyMoney').collection('Users');
        const TransactionCollection = client.db('EzyMoney').collection('Transactions');

        const verifyToken = (req, res, next) => {
            const authHeader = req.headers.authorization;
            console.log(req.headers.authorization)
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized access, no token provided' });
            }

            const token = authHeader.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    console.error('Token verification error:', err); // Debug log
                    return res.status(401).send({ message: 'Unauthorized access, invalid token' });
                }
                req.decoded = decoded;
                next();
            });
        };


        // login
        app.post('/login', async (req, res) => {
            const { mobile, pin } = req.body;
            const email = mobile
            console.log(mobile, pin);
            const user = await UserCollection.findOne({ $or: [{ mobile }, { email }] });
            if (!user) {
                return res.send({ message: '❌ No account Match' })
            }
            if (!await bcrypt.compare(pin, user.pin)) return res.send({ message: '❌ Invalid PIN' });

            const token = jwt.sign({ id: user._id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365days' });
            res.send({ token, number: user.mobile, message: "✅ successfully logged in" });
        });
        // register
        app.post('/sign-up', async (req, res) => {
            const { name, pin, mobile, email, role } = req.body;
            // console.log(name, pin, mobile, email, role);
            const hashedPin = await bcrypt.hash(pin, 10);
            // console.log(hashedPin);
            const user = { name, pin: hashedPin, mobile, email, status: 'pending', balance: 0, role: role };
            console.log(user);
            const token = jwt.sign({ mobile, role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365days' });
            const result = await UserCollection.insertOne(user);
            res.send({ result, token, message: 'Registration successful, waiting for admin approval.' });
        });


        // balance
        app.get('/balance/:user', verifyToken, async (req, res) => {
            const mobile = req.params.user
            const email = mobile
            console.log(mobile);
            const user = await UserCollection.findOne({ $or: [{ mobile }, { email }] });
            // console.log(user);
            res.send({ balance: user.balance, name: user.name, email: user.email, mobile: mobile, status: user.status, role: user.role });
        });



        //all transactions

        // send money
        app.post('/send-money', verifyToken, async (req, res) => {
            const { amount, to, pin, from } = req.body;
            console.log(from, to, pin, amount);
            const amountNum = parseInt(amount);
            if (amountNum < 50) return res.send({message: '❌ Amount should be above 50 tk'});
            if(from=== to) return res.send({message: '❌ You can not send money to yourself'})
            const user = await UserCollection.findOne({ $or: [{ mobile: from }, { email: from }] });
            console.log(user);
            // console.log("hello");
            if (!await bcrypt.compare(pin, user.pin)) return res.send({ message: '❌ Invalid PIN' });
            if (user.balance < amount) return res.send({message: 'Insufficient balance'});
            
            const toUser = await UserCollection.findOne({ mobile: to });
            if (!toUser) return res.send({message : '❌ No EzyMoney Account with this Number'});
            
            
            const fee = amountNum > 100 ? 5 : 0;
            const newAmount = amountNum + fee;
            // console.log(newAmount);
            await UserCollection.updateOne({ _id: user._id }, { $inc: { balance: -newAmount } });
            // console.log("hello");
            await UserCollection.updateOne({ mobile: to }, { $inc: { balance: amountNum } });
            await UserCollection.updateOne({ role: "admin" }, { $inc: { balance: fee } });

            const transaction = { from, to, amount: amountNum , type: 'send money', date: new Date() };
            await TransactionCollection.insertOne(transaction);

            res.send({message :'✅Transaction successful'});
        });

        // Cash Out
        app.post('/cash-out', verifyToken, async (req, res) => {
            const { amount, to, pin, from } = req.body;
            console.log(from, to, pin, amount);
            const amountNum = parseFloat(amount);
            if (amountNum < 50) return res.send({ message: '❌ Amount should be above 50 tk' });
            if (from === to) return res.send({ message: '❌ Enter an agent number' });

            const user = await UserCollection.findOne({ $or: [{ mobile: from }, { email: from }] });
            if (!user) return res.send({ message: '❌ User not found' });

            if (!await bcrypt.compare(pin, user.pin)) return res.send({ message: '❌ Invalid PIN' });

           
            const fee = amountNum * 0.015;
            const totalDeduction = amountNum + fee;

            if (user.balance < totalDeduction) return res.send({message: '❌ Insufficient balance'});

            const toUser = await UserCollection.findOne({ mobile: to });
            if (!toUser) return res.send({ message: '❌ No EzyMoney Account with this Number' });
            if (toUser.role !== "agent") return res.send({ message: '❌ Enter a agent number' });

                await UserCollection.updateOne({ _id: user._id }, { $inc: { balance: -totalDeduction } });
            await UserCollection.updateOne({ mobile: to }, { $inc: { balance: totalDeduction } });

                const transaction = { from, to, amount: amountNum, fee, type: 'cash out', date: new Date() };
            await TransactionCollection.insertOne(transaction);
            
                res.send({ message: '✅ Cash-out successful' });
        });


        // // Cash Out
        // app.post('/cash-out', verifyToken, async (req, res) => {
        //     const { amount, to, pin, from } = req.body;
        //     console.log(from, to, pin, amount);

        //     if (from === to) return res.send({ message: '❌ Enter a agent number' });

        //     const user = await UserCollection.findOne({ $or: [{ mobile: from }, { email: from }] });
        //     if (!user) return res.send({ message: '❌ User not found' });

        //     if (!await bcrypt.compare(pin, user.pin)) return res.send({ message: '❌ Invalid PIN' });

        //     const amountNum = parseFloat(amount);
        //     const fee = amountNum * 0.015;
        //     const totalDeduction = amountNum + fee;

        //     if (user.balance < totalDeduction) return res.status(400).send('❌ Insufficient balance');

        //     const toUser = await UserCollection.findOne({ mobile: to });
        //     if (!toUser) return res.send({ message: '❌ No EzyMoney Account with this Number' });
        //     if (toUser.role !== "agent") return res.send({ message: '❌ Enter a agent number' });

        //     // Perform the balance updates in a transaction to ensure atomicity
        //     const session = await UserCollection.startSession();
        //     session.startTransaction();

        //     try {
        //         await UserCollection.updateOne({ _id: user._id }, { $inc: { balance: -totalDeduction } }, { session });
        //         await UserCollection.updateOne({ mobile: to }, { $inc: { balance: amountNum + fee } }, { session });
        //         await UserCollection.updateOne({ role: "admin" }, { $inc: { balance: fee } }, { session });

        //         const transaction = { from, to, amount: amountNum, fee, type: 'cash out', date: new Date() };
        //         await TransactionCollection.insertOne(transaction, { session });

        //         await session.commitTransaction();
        //         session.endSession();

        //         res.send({ message: '✅ Cash-out successful' });
        //     } catch (error) {
        //         await session.abortTransaction();
        //         session.endSession();
        //         console.error(error);
        //         res.status(500).send('❌ Transaction failed');
        //     }
        // });



        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello World');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
