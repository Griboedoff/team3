require('dotenv').config();

const request = require('supertest');
const path = require('path');

require('should');

const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const User = require('../models/User');
const cloudinary = require('cloudinary');
const setupApiRoutes = require('../routes/api');
const server = require('../server');

mongoose.connect(process.env.DATABASE_CONNECTION_STRING);

cloudinary.config({
    'cloud_name': 'team3',
    'api_key': process.env.CLOUDINARY_API_KEY,
    'api_secret': process.env.CLOUDINARY_API_SECRET
});
let currentUser = 'user_1';

setupServer();

let chatId = null;
const testAvatarPath = path.resolve(__dirname, 'testAvatar.svg');

/* eslint-disable max-statements */
describe('messenger API tests', () => {
    afterEach(async () => {
        await Promise.all([
            User.remove({
                _id: { $in: ['user_1', 'user_2', 'user_3'] }
            }),
            Chat.remove({
                title: { $in: ['apiTest', 'apiTest2'] }
            }),
            cloudinary.v2.uploader.destroy('user_1_profile'),
            cloudinary.v2.uploader.destroy('user_2_profile'),
            cloudinary.v2.uploader.destroy('user_3_profile')
        ]);

        currentUser = 'user_1';
        chatId = null;
    });

    describe('/POST /api/users/:nickname', () => {
        it('should create user with autogenerated avatar', async () => {
            const checkBody = res => {
                res.body.should.have.property('nickname', 'user_1');
                res.body.should
                    .have.property('avatar').with.type('string')
                    .and.should.not.be.empty();
            };

            await request(server)
                .post('/api/users/user_1')
                .expect('Content-type', /json/)
                .expect(200)
                .expect(checkBody);
        });

        it('should not create user twice', async () => {
            const firstResponse = await request(server).post('/api/users/user_1');
            const checkBody = res => {
                res.body.should.have.property('nickname', 'user_1');
                res.body.should.have.property('avatar', firstResponse.body.avatar);
            };

            await request(server)
                .post('/api/users/user_1')
                .expect('Content-type', /json/)
                .expect(200)
                .expect(checkBody);
        });
    });

    describe('/GET /api/users/:nickname', () => {
        it('should return 404 when user doesn\'t exists', async () => {
            await request(server)
                .get('/api/users/user_1')
                .expect(404);
        });

        it('should return user when user exists', async () => {
            await request(server)
                .post('/api/users/user_1')
                .expect(200);

            const checkBody = res => {
                res.body.should.have.property('nickname', 'user_1');
                res.body.should
                    .have.property('avatar').with.type('string')
                    .and.should.not.be.empty();
            };

            await request(server)
                .get('/api/users/user_1')
                .expect('Content-type', /json/)
                .expect(200)
                .expect(checkBody);
        });
    });

    describe('/PATCH /api/users/:nickname/avatar', () => {
        it('should return 400 when user doesn\'t exists', async () => {
            await request(server)
                .patch('/api/users/user1/avatar')
                .attach('userAvatar', testAvatarPath)
                .expect(400);
        });

        it('should update user avatar', async () => {
            await request(server)
                .post('/api/users/user_1')
                .expect(200);

            await request(server)
                .patch('/api/users/user_1/avatar')
                .attach('userAvatar', testAvatarPath)
                .expect(200);

            const checkBody = res => {
                res.body.should.have.property('nickname', 'user_1');
                res.body.should.have.property('avatar');
                res.body.avatar.should.match(/^https:\/\/res.cloudinary.com\/team3\/image\/upload/);
            };

            await request(server)
                .get('/api/users/user_1')
                .expect(200)
                .expect(checkBody);
        });
    });

    describe('/POST /api/chats', () => {
        it('should return 400 when membrs list is empty', async () => {
            await request(server)
                .post('/api/chats')
                .send({ type: 'group', members: [], title: 'apiTest' })
                .expect(400);
        });

        it('should return 400 when private chat has more then two members', async () => {
            await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['a', 'b', 'c'], title: 'apiTest' })
                .expect(400);
        });

        it('should return 400 when members is null', async () => {
            await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: null, title: 'apiTest' })
                .expect(400);
        });

        it('should return 400 when members is undefined', async () => {
            await request(server)
                .post('/api/chats')
                .send({ type: 'private', title: 'apiTest' })
                .expect(400);
        });

        it('should return 400 when chat has unknown type', async () => {
            await request(server)
                .post('/api/chats')
                .send({ type: 'fake', members: ['a', 'b'], title: 'apiTest' })
                .expect(400);
        });

        it('should create private chat', async () => {
            await request(server).post('/api/users/user_1');
            await request(server).post('/api/users/user_2');

            await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_1', 'user_2'], title: 'apiTest' })
                .expect(200)
                .expect(checkChat('private', 'apiTest', ['user_1', 'user_2'], []))
                .expect(res => res.body.should.not.have.property('avatar'));
        });

        it('should create group chat', async () => {
            await request(server).post('/api/users/user_1');
            await request(server).post('/api/users/user_2');
            await request(server).post('/api/users/user_3');

            await request(server)
                .post('/api/chats')
                .send({ type: 'group', members: ['user_1', 'user_2', 'user_3'], title: 'apiTest' })
                .expect(200)
                .expect(checkChat('group', 'apiTest', ['user_1', 'user_2', 'user_3'], []))
                .expect(res => res.body.should.have.property('avatar'));
        });
    });

    describe('/GET /api/chats', () => {
        beforeEach(async () => {
            await request(server)
                .post('/api/users/user_1')
                .expect(200);

            await request(server)
                .post('/api/users/user_2')
                .expect(200);

            await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_1', 'user_2'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_2', 'user_3'], title: 'apiTest' })
                .expect(200);
        });

        it('should get only chats where user is member', async () => {
            const checkChats = res => {
                res.body.should.be.an.instanceOf(Array).with.lengthOf(1);
                checkChat('private', 'apiTest', ['user_1', 'user_2'], [])({ body: res.body[0] });
            };

            await request(server)
                .get('/api/chats')
                .expect(200)
                .expect(checkChats);
        });

        it('should return 401 when session user is undefined', async () => {
            currentUser = undefined;
            server.use((req, res, next) => {
                console.log(req.user);
                req.user = { nickname: currentUser };
                next();
            });

            await request(server)
                .get('/api/chats')
                .expect(401);
        });
    });

    describe('/PATCH /api/chats/:id/avatar', () => {
        it('should return 400 when chat doesn\'t exists', async () => {
            await request(server)
                .patch(`/api/chats/${mongoose.Types.ObjectId()}/avatar`)
                .attach('chatAvatar', testAvatarPath)
                .expect(400);
        });

        it('should update chat avatar', async () => {
            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'group', members: ['a', 'b', 'c'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .patch(`/api/chats/${body._id}/avatar`)
                .attach('chatAvatar', testAvatarPath)
                .expect(200);
        });
    });

    describe('/PATCH /api/chats/:id/title', () => {
        it('should return 400 when chat doesn\'t exists', async () => {
            await request(server)
                .patch(`/api/chats/${mongoose.Types.ObjectId()}/title`)
                .send({ title: 'newTitle' })
                .expect(400);
        });

        it('should update chat title', async () => {
            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'group', members: ['a', 'b', 'c'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .patch(`/api/chats/${body._id}/title`)
                .send({ title: 'apiTest2' })
                .expect(200);
        });
    });

    describe('/POST /api/chats/:id/members/:nickname', () => {
        beforeEach(async () => {
            await request(server)
                .post('/api/users/user_1')
                .expect(200);
        });

        it('should return 400 when chat doesn\'t exists', async () => {
            await request(server)
                .post(`/api/chats/${mongoose.Types.ObjectId()}/members/user_1`)
                .expect(400);
        });

        it('should return 400 when new member doesn\'t exists', async () => {
            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'group', members: ['user_1'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .post(`/api/chats/${body._id}/members/user_2`)
                .expect(400);
        });

        it('should not add new member in private chat', async () => {
            await request(server)
                .post('/api/users/user_2')
                .expect(200);

            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_3', 'user_1'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .post(`/api/chats/${body._id}/members/user_2`)
                .expect(400);
        });

        it('should not add new member in group chat', async () => {
            await request(server)
                .post('/api/users/user_2')
                .expect(200);

            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'group', members: ['user_3', 'user_1'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .post(`/api/chats/${body._id}/members/user_2`)
                .expect(200);
        });
    });

    describe('/DELETE /api/chats/:id/members/:nickname', () => {
        beforeEach(async () => {
            await request(server)
                .post('/api/users/user_1')
                .expect(200);
        });

        it('should return 400 when chat doesn\'t exists', async () => {
            await request(server)
                .delete(`/api/chats/${mongoose.Types.ObjectId()}/members/user_1`)
                .expect(400);
        });

        it('should return 400 when chat is private', async () => {
            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_1', 'user_2'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .post(`/api/chats/${body._id}/members/user_1`)
                .expect(400);
        });

        it('should delete member from group chat', async () => {
            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'group', members: ['user_3', 'user_1'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .delete(`/api/chats/${body._id}/members/user_1`)
                .expect(200);
        });
    });

    describe('/POST /api/chats/:id/messages', () => {
        beforeEach(async () => {
            await request(server)
                .post('/api/users/user_1')
                .expect(200);

            await request(server)
                .post('/api/users/user_2')
                .expect(200);

            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_1', 'user_2'], title: 'apiTest' })
                .expect(200);

            chatId = body._id;
        });

        it('should return 400 when chat doesn\'t exists', async () => {
            await request(server)
                .post(`/api/chats/${mongoose.Types.ObjectId()}/messages`)
                .send({ text: 'test' })
                .expect(400);
        });

        it('should return 401 when author is undefined', async () => {
            currentUser = undefined;
            await request(server)
                .post(`/api/chats/${chatId}/messages`)
                .send({ text: 'test' })
                .expect(401);
        });

        it('should return 400 when author is not chat member', async () => {
            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_3', 'user_2'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .post(`/api/chats/${body._id}/messages`)
                .send({ text: 'test' })
                .expect(400);
        });

        it('should add message to chat', async () => {
            await request(server)
                .post(`/api/chats/${chatId}/messages`)
                .send({ text: 'test **link**' })
                .expect(200);

            const checkMessages = res => {
                res.body.should.be.an.instanceOf(Array).with.lengthOf(1);
                res.body[0].should.have.property('text', 'test **link**');
                res.body[0].should.have.property('author', 'user_1');
                res.body[0].should.have.property('date');
            };

            await request(server)
                .get(`/api/chats/${chatId}/messages`)
                .expect(200)
                .expect(checkMessages);
        });
    });

    describe('/GET /api/chats/:id/messages', () => {
        beforeEach(async () => {
            await request(server)
                .post('/api/users/user_1')
                .expect(200);

            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_1', 'user_2'], title: 'apiTest' })
                .expect(200);

            chatId = body._id;
        });

        it('should return 400 when chat doesn\'t exists', async () => {
            await request(server)
                .get(`/api/chats/${mongoose.Types.ObjectId()}/messages`)
                .send({ text: 'test' })
                .expect(400);
        });

        it('should return 401 when author is undefined', async () => {
            currentUser = undefined;
            await request(server)
                .get(`/api/chats/${chatId}/messages`)
                .expect(401);
        });

        it('should return 400 when user is not chat member', async () => {
            const { body } = await request(server)
                .post('/api/chats')
                .send({ type: 'private', members: ['user_3', 'user_2'], title: 'apiTest' })
                .expect(200);

            await request(server)
                .get(`/api/chats/${body._id}/messages`)
                .expect(400);
        });

        it('should get messages', async () => {
            await request(server)
                .post(`/api/chats/${chatId}/messages`)
                .send({ text: 'test **link**' })
                .expect(200);

            const checkMessages = res => {
                res.body.should.be.an.instanceOf(Array).with.lengthOf(1);
                res.body[0].should.have.property('text', 'test **link**');
                res.body[0].should.have.property('author', 'user_1');
                res.body[0].should.have.property('date');
            };

            await request(server)
                .get(`/api/chats/${chatId}/messages`)
                .expect(200)
                .expect(checkMessages);
        });
    });
});

/* eslint-disable max-params*/
function checkChat(type, title, members, messages) {
    return res => {
        res.body.should.have.property('type', type);
        res.body.should.have.property('title', title);
        res.body.should.have.property('members').with.lengthOf(members.length);
        res.body.should.have.property('messages', messages);
    };
}

function setupServer() {
    server.use((req, res, next) => {
        req.user = { nickname: currentUser };
        next();
    });

    setupApiRoutes(server);
    server.listen(8080);

    return server;
}
