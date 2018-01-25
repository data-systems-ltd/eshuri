const Classe =require('../models/Classe'),
      Course =require("../models/Course"),
      User =require("../models/User"),
      School = require('../models/School'),
      Notification=require("../models/Notification"),
      Content=require('../models/Content'),
      log_err=require('./manage/errorLogger'),
      Finalist=require('../models/Finalist'),
      SchoolProgram=require('../models/SchoolProgram'); 
/*
Une classe est par exemple S2MCE pour le sHigh school ou 3 rd Year in Universitites
*/

// Create a new classe
exports.postNewClass =(req,res,next)=>{
  var classLevel=req.body.level;
  req.assert('school_id', 'Invalid data').notEmpty().isMongoId();
  req.assert('class_teacher', 'Invalid data').notEmpty().isMongoId();
  req.assert('level', 'A level must be a number').isInt();
  req.assert('name', 'A name is required').notEmpty();
  req.assert('currentTerm', 'Sorry, specifiy a term').isInt();
  if(classLevel<=3) 
    req.assert('sub_level', 'Select sub level eg.:A,B...').isIn(['a','b','c','d']).notEmpty();
  else req.assert('option', 'Select option').notEmpty();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  // Test if shool exixts
  School.findOne({_id:req.body.school_id},(err,school)=>{
    if(err) return log_err(err,false,req,res);
    else if(!school) return res.status(500).send("This school doesn't exists");
    else if(req.body.currentTerm > school.term_quantity)
      return res.status(400).send("Sorry term must be lower to "+school.term_quantity);
    //check if the class doens t exists
    Classe.findOne({name:req.body.name.trim().toLowerCase(),school_id:req.body.school_id},(err,classe_exists)=>{
      if(err) return log_err(err,false,req,res);
      else if(classe_exists) return res.status(400).send("This class is already registered");
      //Now we will create the class
      req.body.option=req.body.option===null?'':req.body.option;
      req.body.sub_level=req.body.sub_level?req.body.sub_level:'';
      console.log('Body: '+JSON.stringify(req.body));
      var newClass = new Classe({
        school_id:req.body.school_id,
        level:req.body.level,
        name:req.body.name,
        academic_year:Number(new Date().getFullYear())-2000,
        class_teacher:req.body.class_teacher,
        currentTerm:req.body.currentTerm,
        option:req.body.option,
        sub_level:req.body.sub_level,
      });      
      newClass.save((err)=>{
        if(err) return console.log(JSON.stringify(err));
        return res.end();
      })
    })    
  });
}

// recuperer le contenu des classe
exports.getClasses_JSON = (req,res,next)=>{
  req.assert('school_id', 'Invalid data').isMongoId();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  else if(String(req.params.school_id)!=String(req.user.school_id))return res.status(400).send("This is not your school")
  Classe.find({school_id:req.params.school_id},{__v:0}).sort({name:1})
  .lean()
  .exec((err,classes)=>{
    if(err) return log_err(err,false,req,res);
    var listClasses=[];
    var async =require('async');
    async.each(classes,(currentClass,cb)=>{
      // For each class, i count the number of students
      User.count({class_id:currentClass._id},(err,num)=>{
        if(err) return cb(err);
        currentClass.students=num
        cb();
      })

    },(err)=>{
      if(err) return log_err(err,false,req,res);
      return res.json(classes);  
    })
  })
}
exports.getPageOneClasse = (req,res,next)=>{
  req.assert('classe_id', 'Invalid data').isMongoId();
  const errors = req.validationErrors();
  if(errors) return res.render("./lost",{msg:"Invalid data"})
  var class_name = '', first_letter='';
  School.findOne({_id:req.user.school_id},(err,school_exists)=>{
    if(err) return log_err(err,false,req,res);
    else if(!school_exists)  return res.status(400).send("This school doesn't exists ");
    Classe.findOne({_id:req.params.classe_id,school_id:req.user.school_id},(err,classe_exists)=>{
      if(err) return log_err(err,false,req,res);
      else if(!classe_exists)  return res.status(400).send("This class doesn't exists ");
      first_letter=classe_exists.name.toLowerCase().charAt(0);
      class_name = first_letter==='s'?classe_exists.name:'s'+classe_exists.name;
      return res.render('school/view_class_term',{
        title:class_name.toUpperCase(),
        pic_id:req.user._id,
        school_name:school_exists.name,
        term_quantity:school_exists.term_quantity,
        class_id:req.params.classe_id,
        school_id:req.user.school_id,
        pic_name:req.user.name.replace('\'',"\\'"),
        access_lvl:req.user.access_level,
        csrf_token:res.locals.csrftoken, // always set this buddy
      })
    })
  })
}
exports.getClassCourses = (req, res, next)=>{
  console.log(req.params.t_quantity)
  req.assert('classe_id', 'Invalid data').isMongoId();
  req.assert('t_quantity', 'Invalid data').isIn([2,3]);
  const errors = req.validationErrors();
  if(errors) return res.status(400).send("Invalid data")
  var t_qty = req.params.t_quantity;
  var allterms = [],response=[],term1=[],term2=[],term3=[], allcourses=[];
  var access_lvl = req.user.access_level,
      student = req.app.locals.access_level.STUDENT;
  var parametters = {};
  if(t_qty==3) allterms=[1,2,3];
  else if (t_qty==2) allterms=[1,2];
  else return res.status(400).send("Invalid term data")
  var async = require('async');
  // Get courses according to the access level
  if(access_lvl==student) parametters = {class_id:req.params.classe_id,school_id:req.user.school_id};
  else parametters = {class_id:req.params.classe_id,school_id:req.user.school_id, teacher_list:req.user._id};
  Course.find(parametters,{teacher_list:0,__v:0,attendance_limit:0}).lean().exec((err, courses)=>{
    if(err) return log_err(err,false,req,res);
    allcourses=courses;
    async.eachSeries(allcourses, (thisCourse, courseCallback)=>{
      Content.count({course_id:thisCourse._id,school_id:req.user.school_id},(err, content_number)=>{
        if(err) return courseCallback(err);
        thisCourse.content_number=content_number;
        courseCallback()
      })
    },(err)=>{
      if(err) return log_err(err,false,req,res);
      for(var i=0; i<allcourses.length; i++){
        if(allcourses[i].currentTerm==1) term1.push(allcourses[i]);
        if(allcourses[i].currentTerm==2) term2.push(allcourses[i]);
        if(allcourses[i].currentTerm==3 && t_qty==3) term3.push(allcourses[i]);
      }
      response.push({t_name:'1',t_content:term1},{t_name:'2',t_content:term2},{t_name:'3',t_content:term3});
      // console.log('Courses: '+JSON.stringify(response))
      return res.json(response);
    })
  })
}
exports.getNextClasses = (req, res, next)=>{
  req.assert('class_id', 'Invalid data').isMongoId();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  var parametters = {};
  Classe.findOne({_id:req.params.class_id,school_id:req.user.school_id},(err, class_exists)=>{
    if(err) return log_err(err,false,req,res);
    if(!class_exists) return res.status(400).send("Unkown class");
    var next_class = Number(class_exists.level)+1;
    if(class_exists.level>3) parametters = {level:next_class, school_id:req.user.school_id, option:class_exists.option};
    else parametters = {level:next_class, school_id:req.user.school_id};
    Classe.find(parametters, (err, nextClasses)=>{
      if(err) return log_err(err,false,req,res);
      // console.log('LEVEL: '+next_class+' Classes:'+JSON.stringify(nextClasses))
      return res.json(nextClasses);
    })
  })
}
exports.getToNextClass = (req,res,next)=>{
  req.assert('class_id', 'Invalid data').isMongoId();
  req.assert('student_id', 'Invalid data').isMongoId();
  req.assert('level', 'Invalid data').isIn([1,2,3,4,5,6]);
  if(req.body.new_class!=="fin") req.assert('new_class', 'Invalid data new class').isMongoId();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  var new_class = req.body.new_class;
  var level = req.body.level,
      next_level = Number(level)+1,
      finalist = Number(level)==3||Number(level)==6?true:false;
  // Check if user is allowed to be finalist
  // if(new_class=="fin"&&()) 
  School.findOne({_id:req.user.school_id},(err, school_exists)=>{
    if(err) return log_err(err,false,req,res);
    else if(!school_exists)  return res.status(400).send("This school doesn't exists ");
    if(new_class!=="fin"){
      Classe.findOne({_id:new_class,school_id:school_exists._id}, (err, class_exists)=>{
        if(err) return log_err(err,false,req,res);
        else if(!class_exists)  return log_err(err,false,req,res);
        else if(class_exists.level!=next_level) return res.status(400).send("Invalid next class");
        User.findOne({_id:req.body.student_id,school_id:school_exists._id,class_id:req.body.class_id,access_level:req.app.locals.access_level.STUDENT},(err, student_exists)=>{
          if(err) return log_err(err,false,req,res);
          else if(!student_exists) return res.status(400).send("Unkown student");
          student_exists.class_id = class_exists._id;
          student_exists.prev_classes.push(req.body.class_id);
          student_exists.save((err, done)=>{
            if(err) return log_err(err,false,req,res);
            // Save for user notification
            new Notification({
              user_id:req.user._id,
              user_name:req.user.name,
              content:req.user.name+" has changed your class to S"+class_exists.name+". You are welcome into next level. SUCCESS!!!",
              school_id:school_exists._id,
              class_id:class_exists._id,
              dest_id:student_exists._id,
              isAuto:false
            }).save((err)=>{
              if(err) return log_err(err,false,req,res);
              res.end();
            })
          })
        })
      })
    }
    else{
      if(!finalist) return res.status(400).send("This student must not be a finalist");
      User.findOne({_id:req.body.student_id,school_id:school_exists._id,class_id:req.body.class_id,access_level:req.app.locals.access_level.STUDENT},(err, student_exists)=>{
        if(err) return log_err(err,false,req,res);
        else if(!student_exists) return res.status(400).send("Unkown student");
        student_exists.class_id = null;
        student_exists.prev_classes.push(req.body.class_id);
        student_exists.save((err, done)=>{
          if(err) return log_err(err,false,req,res);
          new Finalist({
            school_id:school_exists._id,
            class_id:req.body.class_id,
            student_id:student_exists._id,
            academic_year:req.body.academic_year,
          }).save((err)=>{
            if(err) return log_err(err,false,req,res);
            // Save for user notification
            new Notification({
              user_id:req.user._id,
              user_name:req.user.name,
              content:"you are finalist at "+school_exists.name.toUpperCase()+". SUCCESS!!!",
              school_id:school_exists._id,
              // class_id:class_exists._id,
              dest_id:student_exists._id,
              isAuto:false
            }).save((err)=>{
              if(err) return log_err(err,false,req,res);
              res.end();
            })
          })
        })
      })
    }
  })
}
exports.returnToPreviousClass = (req,res,next)=>{
  req.assert('class_id', 'Invalid data').isMongoId();
  req.assert('student_id', 'Invalid data').isMongoId();
  req.assert('level', 'Invalid data').isIn([1,2,3,4,5,6]);
  req.assert('new_class', 'Invalid data new class').isMongoId();
  var async=require('async');
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  var new_class = req.body.new_class;
  var level = req.body.level,
      previous_level = Number(level)-1;
   School.findOne({_id:req.user.school_id},(err, school_exists)=>{
    if(err) return log_err(err,false,req,res);
    else if(!school_exists)  return res.status(400).send("This school doesn't exists ");
    Classe.findOne({_id:new_class,school_id:school_exists._id}, (err, class_exists)=>{
      if(err) return log_err(err,false,req,res);
      else if(!class_exists)  return log_err(err,false,req,res);
      else if(class_exists.level!=previous_level) return res.status(400).send("Invalid previous class");
      User.findOne({_id:req.body.student_id,school_id:school_exists._id,class_id:req.body.class_id,access_level:req.app.locals.access_level.STUDENT},(err, student_exists)=>{
        if(err) return log_err(err,false,req,res);
        else if(!student_exists) return res.status(400).send("Unkown student");
        else if(student_exists.prev_classes.indexOf(new_class)==-1) return res.status(400).send("Service is'nt available");
        var newClasses = [];
        async.each(student_exists.prev_classes, (thisClasse, callBack)=>{
          if(thisClasse!=new_class) newClasses.push(thisClasse);
          return callBack(null);
        },(err)=>{
          if(err) return log_err(err,false,req,res);
          student_exists.class_id = class_exists._id;
          student_exists.prev_classes = newClasses;
          student_exists.save((err)=>{
            if(err) return log_err(err,false,req,res);
            return res.end();
          })
        })
      })
    })
  })
}
exports.getClasses_JSON_For_Report = (req,res,next)=>{
  req.assert('school_id', 'Invalid data').isMongoId();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  // else if(String(req.body.school_id)==String(req.user.school_id))
  //   return res.status(400).send("This is not your school")
  Classe.find({school_id:req.params.school_id},{__v:0})
  .sort({name:1})
  .exec((err,classes)=>{
    if(err) return log_err(err,false,req,res);
    return res.json(classes);
  })
}

exports.getClasses_JSONConfirm = (req,res,next)=>{
  req.assert('school_id', 'Invalid data').isMongoId();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  // else if(String(req.body.school_id)==String(req.user.school_id))
  //   return res.status(400).send("This is not your school")
  Classe.find({school_id:req.params.school_id},{__v:0})
  .sort({name:1})
  .exec((err,classes)=>{
    if(err) return log_err(err,false,req,res);
    var listClasses=[];
    var async =require('async');
    async.each(classes,(currentClass,cb)=>{
      // For each class, i count the number of students
      User.count({class_id:currentClass._id,isEnabled:false,access_level:req.app.locals.access_level.STUDENT},(err,num)=>{
        if(err) return cb(err);
        listClasses.push({_id:currentClass._id, name:currentClass.name,level:currentClass.level,currentTerm:currentClass.currentTerm,academic_year:currentClass.academic_year,
          students:num});
        cb();
      })

    },(err)=>{
      if(err) return log_err(err,false,req,res);
      return res.json(listClasses);  
    })
  })
}
// Modifier un class
exports.editClasse = (req, res, next)=>{
  var classLevel=req.body.level;
  req.assert('classe_id', 'Invalid data').isMongoId().notEmpty();
  req.assert('name', 'A name is required').notEmpty();
  req.assert('level', 'Type valid level').notEmpty().isIn([1,2,3,4,5,6]);
  if(classLevel<=3) 
    req.assert('sub_level', 'Specifiy sub level eg.:A,B...').isIn(['a','b','c','d']).notEmpty();
  else req.assert('option', 'Specifiy option').notEmpty();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  //Chech if class name if exit in that school
  // req.body.name=req.body.name.toLowerCase();
  req.body.option=req.body.option?req.body.option.trim().toLowerCase():'';
  req.body.sub_level=req.body.sub_level?req.body.sub_level.trim().toLowerCase():'';
  SchoolProgram.findOne({school_id:req.user.school_id,abbreviation:req.body.option},(err, name_exist)=>{
    if(err) return log_err(err,false,req,res);
    if(!name_exist&&(classLevel>3)) return res.status(400).send("Name not match any school program");
    //Check if the new name will not conflict to the other name
    Classe.findOne({school_id:req.user.school_id,name:req.body.name.trim().toLowerCase()},(err, class_exist)=>{
      if(err) return log_err(err,false,req,res);
      console.log('class exist: '+JSON.stringify(class_exist))
      if(class_exist && class_exist._id!=req.body.classe_id) return res.status(400).send("There class with the same informations");
      //Find that class and update it
      Classe.findOne({school_id:req.user.school_id,_id:req.body.classe_id},(err, this_classe)=>{
        if(err) return log_err(err,false,req,res);
        if(!this_classe) return res.status(400).send("Unkown class");
        this_classe.name=req.body.name;
        this_classe.level=req.body.level;
        this_classe.option=req.body.option;
        this_classe.sub_level=req.body.sub_level;
        this_classe.save((err, ok)=>{
          if(err) return log_err(err,false,req,res);
          return res.end();
        })
      })
    })
  })
}
// Supprimer un classe 
exports.removeClasse = function(req,res,next){ // D
  req.assert('classe_id', 'Invalid data').isMongoId();
  req.assert('confirmPass', 'Super admin password is required to do this action').notEmpty();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  // il faut verifier si y apas de cours 
  var async =require('async');
  var course_number=0,user_number=0;
  // il faut verifier si y a pas de people inside..
  async.parallel([
    (cb)=>{
      Course.count({class_id:req.body.classe_id},(err,num)=>{
        if(err) return cb(err);
        course_number = num;
        cb();
      })
    },
    (cb)=>{
      User.count({class_id:req.body.classe_id},(err,num)=>{
        if(err) return cb(err);
        user_number = num;
        cb();
      })
    }
    ],(err)=>{
      if(err) return res.status(400).send(err);
      else if(user_number>0)
      return res.status(400).send('There is still '+user_number+' users in this class,<br> Remove them first');
      else if(course_number>0)
      return res.status(400).send('There is still '+course_number+' courses in this class,<br> Remove them first');
      Classe
        .remove({_id:req.body.classe_id},function(err, classes){
          if(err) return log_err(err,false,req,res);
          return res.end(); // when OK
      })
  });   
}
exports.updateSettings =function(req,res,next){ // D
  // console.log(' DATA is '+JSON.stringify(req.body));
  req.assert('academic_year', 'Invalid academic year').isInt();
  req.assert('currentTerm', 'Invalid term').isInt();
  req.assert('class_id', 'Invalid class').isMongoId();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);

  School.findOne({_id:req.user.school_id},(err,school_exists)=>{
    if(err) return log_err(err,false,req,res);
    else if(!school_exists)  return res.status(400).send("School not recognized");
    else if(req.body.currentTerm> school_exists.term_quantity)
       return res.status(400).send("Invalid data");
    Classe.findOne({_id:req.body.class_id,school_id:req.user.school_id},(err,class_exists)=>{
      if(err) return log_err(err,false,req,res);
      else if(!class_exists) return res.status(400).send("Invalid data");
      else if(req.body.academic_year<=2000) return res.status(400).send("Invalid academic year");

      class_exists.academic_year =Number(req.body.academic_year)-2000;
      class_exists.currentTerm =req.body.currentTerm;
      class_exists.save((err)=>{
        if(err) return log_err(err,false,req,res);
        return res.end();
      })
    })
  }) 
}
exports.setClassTeacher =function(req,res,next){ // D
  // console.log(' DATA is '+JSON.stringify(req.body));
  req.assert('teacher_id', 'Invalid data').isMongoId();
  req.assert('class_id', 'Invalid data').isMongoId();
  const errors = req.validationErrors();
  if (errors) return res.status(400).send(errors[0].msg);
  var allClasses=[],selectedClasses=[],nsClasses=[];
  var newClass='';
  var async = require('async');
  School.findOne({_id:req.user.school_id},(err,school_exists)=>{
    if(err) return log_err(err,false,req,res);
    else if(!school_exists)  return res.status(400).send("School not recognized");
    Classe.findOne({school_id:req.user.school_id, class_teacher:req.body.teacher_id},(err, isClassTeacher)=>{
      if(err) return log_err(err,false,req,res);
      if(isClassTeacher) return res.status(400).send("Sorry this teacher is class teacher in another class");
      Classe.findOne({_id:req.body.class_id,school_id:school_exists._id},(err,class_exists)=>{
        if(err) return log_err(err,false,req,res);
        else if(!class_exists) return res.status(400).send("Invalid data");
        //else if(class_exists.class_teacher) return res.status(400).send("Invalid data");
        class_exists.class_teacher =req.body.teacher_id;
        class_exists.save((err)=>{
          if(err) return log_err(err,false,req,res);
          return res.end();
        })
      })
    })
  }) 
}