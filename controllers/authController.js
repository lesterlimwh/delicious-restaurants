const passport = require('passport'); // library we use to log people in
const crypto = require('crypto'); // built in node method
const mongoose = require('mongoose');
const User = mongoose.model('User');
const promisify = require('es6-promisify');
const mail = require('../handlers/mail');

exports.login = passport.authenticate('local', {
	failureRedirect: '/login',
	failureFlash: 'Failed to login.',
	successRedirect: '/',
	successFlash: 'You are now logged in.'
});

exports.logout = (req, res) => {
	req.logout(); // passport method
	req.flash('You are now logged out.');
	res.redirect('/');
}

exports.isLoggedIn = (req, res, next) => {
	// first check if the user is authenticated using passport isAuthenticated
	if(req.isAuthenticated()){
		next();
		return;
	}
	req.flash('error', 'You must be logged in to create a store.');
	res.redirect('/login');
};

exports.forgot = async (req, res) => {
	// see if a user with the email exists
	const user = await User.findOne({ email: req.body.email });
	if(!user){
		req.flash('success', 'You have been emailed a password reset link.');
		return res.redirect('/login');
	}
	// set reset tokens and expiry time on their account
	user.resetPasswordToken = crypto.randomBytes(20).toString('hex');
	user.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
	await user.save();
	// send an email with the token
	const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`;
	await mail.send({
		user,
		subject: 'Password Reset',
		resetURL,
		filename: 'password-reset'
	});
	req.flash('success', 'You have been emailed a password reset link.');
	// redirect to login page
	res.redirect('/login');
};

exports.reset = async (req, res) => {
	const user = await User.findOne({
		resetPasswordToken: req.params.token,
		resetPasswordExpires: { $gt: Date.now() } // passwordExpires is in the future
	});
	if(!user){
		req.flash('error', 'Password reset is invalid or has expired.');
		return res.redirect('/login');
	}
	// if there is a user, show reset password form
	res.render('reset', { title: 'Reset your password' });
};

exports.confirmedPasswords = (req, res, next) => {
	if(req.body.password === req.body['password-confirm']){
		next();
		return;
	}
	req.flash('error', 'Passwords do not match.');
	res.redirect('back');
};

exports.update = async (req, res) => {
	const user = await User.findOne({
		resetPasswordToken: req.params.token,
		resetPasswordExpires: { $gt: Date.now() }
	});
	if(!user){
		req.flash('error', 'Password reset is invalid or has expired.');
		return res.redirect('/login');
	}
	const setPassword = promisify(user.setPassword, user); // setPassword is from passport
	await setPassword(req.body.password);
	user.resetPasswordToken = undefined;
	user.resetPasswordExpires = undefined;
	const updatedUser = await user.save();
	await req.login(updatedUser);
	req.flash('success', 'Password has been reset. You are now logged in.');
	res.redirect('/');
};
